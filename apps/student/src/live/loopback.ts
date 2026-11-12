/**
 * Loopback room — same interface as the LiveKit adapter, but everything travels between browser tabs on one device:
 *  • data features (chat, Q&A, polls, quiz, whiteboard, hands, reactions, files, stage) over a BroadcastChannel
 *  • camera, microphone and screen share as real WebRTC (the BroadcastChannel only carries the signalling)
 * The host publishes to every learner ("down" connections). A learner can publish mic/camera only after the host
 * allowed them to speak ("up" connection to the host); the host plays it and relays it to the other learners.
 * There is NO fake content: nothing appears unless a real participant sends it. Across different devices a media server is still required.
 */
import { decodeMsg, encodeMsg, isAllowedFrom, type RoomMsg } from './protocol';
import type { PersonInfo, RoomHandlers } from './livekit';
import { explainMediaError, getUserMediaChecked } from './devices';

type Dir = 'down' | 'up'; // down: host → learner · up: learner → host
type Meta = { cam?: string; screen?: string; spk?: { id: string; name: string; stream: string } };
type Env =
  | { k: 'msg'; from: PersonInfo; body: string }
  | { k: 'join'; p: PersonInfo }
  | { k: 'here'; to: string; p: PersonInfo }
  | { k: 'leave'; id: string }
  | { k: 'rtc'; to: string; from: string; dir: Dir; gen: number; kind: 'offer' | 'answer' | 'ice' | 'bye'; data: any; meta?: Meta };

export interface LoopbackCtx {
  sessionId: string;
  userId: string;
  name: string;
  isHost: boolean;
}

export const loopbackAvailable = () => typeof BroadcastChannel !== 'undefined';
const rtcAvailable = () => typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices;
const key = (id: string, dir: Dir) => `${id}:${dir}`;

const friendly = (e: unknown, what: string) => {
  const n = (e as { name?: string })?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return new Error(`Allow ${what} access in the browser to continue.`);
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return new Error(`No ${what} was found on this device.`);
  if (n === 'NotReadableError') return new Error(`The ${what} is being used by another app.`);
  return new Error(`Could not start the ${what}.`);
};

const liveVideo = (s?: MediaStream | null) => (s && s.getVideoTracks().some((t) => t.readyState === 'live') ? s : null);
const liveAny = (s?: MediaStream | null) => !!s && s.getTracks().some((t) => t.readyState === 'live');

export class LoopbackRoom {
  private ch: BroadcastChannel | null = null;
  private peers = new Map<string, PersonInfo>();
  private me: PersonInfo;
  // WebRTC
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  // Every change of what is being sent builds a brand-new connection ("generation"). Re-using a live connection after
  // removing and re-adding a track is what made "mic on → off → on" silent, so we never do that.
  private sigs = new Map<string, string>(); // connection → the set of tracks it was built for
  private gens = new Map<string, number>(); // connection → generation I offered
  private recvGen = new Map<string, number>(); // connection → newest generation I accepted
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private camStream: MediaStream | null = null; // my camera + microphone (host: to everyone · learner: to the host)
  private screenStream: MediaStream | null = null; // host: screen share
  private meta: Meta = {}; // learner: which incoming stream is which
  private incoming = new Map<string, MediaStream>();
  private audioEls = new Map<string, HTMLAudioElement>();
  // host only
  private allowed = new Set<string>(); // learners the host let speak
  private speakers = new Map<string, { name: string; stream: MediaStream }>(); // learners currently publishing

  constructor(private h: RoomHandlers, private ctx: LoopbackCtx) {
    this.me = { id: ctx.userId, name: ctx.name, isHost: ctx.isHost, speaking: false, micOn: false, camOn: false };
  }

  private emitPeople() {
    this.h.onPeople([this.me, ...this.peers.values()]);
  }

  async connect() {
    if (!loopbackAvailable()) throw new Error('Live classes are not available on this device yet.');
    const ch = new BroadcastChannel(`bodhin-room:${this.ctx.sessionId}`);
    this.ch = ch;
    ch.onmessage = (ev: MessageEvent<Env>) => {
      const e = ev.data;
      if (!e || typeof e !== 'object') return;
      if (e.k === 'join' && e.p?.id && e.p.id !== this.me.id) {
        this.resetPeer(e.p);
        this.peers.set(e.p.id, e.p);
        this.post({ k: 'here', to: e.p.id, p: this.me });
        this.emitPeople();
        if (this.me.isHost && !e.p.isHost) this.syncPeer(e.p.id); // a learner arrived while we are publishing
        if (!this.me.isHost && e.p.isHost) this.syncUp(); // the host arrived while we are speaking
      } else if (e.k === 'here' && e.to === this.me.id && e.p?.id) {
        this.peers.set(e.p.id, e.p);
        this.emitPeople();
        if (!this.me.isHost && e.p.isHost) this.syncUp();
      } else if (e.k === 'leave') {
        this.peers.delete(e.id);
        this.closePeer(e.id);
        this.emitPeople();
      } else if (e.k === 'msg' && e.from?.id && e.from.id !== this.me.id) {
        const m = decodeMsg(e.body);
        if (!m) return;
        const from = this.peers.get(e.from.id) ?? e.from;
        // the role is whatever this peer announced when it joined — a message cannot promote its sender
        if (!isAllowedFrom(m, from.isHost ? 'host' : 'student')) return;
        this.h.onMsg(m, from);
      } else if (e.k === 'rtc' && e.to === this.me.id) {
        this.onSignal(e).catch(() => {});
      }
    };
    this.h.onState('connected');
    this.post({ k: 'join', p: this.me });
    this.emitPeople();
  }

  private post(e: Env) {
    try {
      this.ch?.postMessage(e);
    } catch {
      /* channel closed */
    }
  }

  async send(m: RoomMsg) {
    if (this.me.isHost && m.t === 'allow_speak') {
      if (m.on) this.allowed.add(m.who);
      else {
        this.allowed.delete(m.who);
        this.dropSpeaker(m.who); // taking the permission back stops their audio and video at once
      }
    }
    this.post({ k: 'msg', from: this.me, body: new TextDecoder().decode(encodeMsg(m)) });
  }

  /* ───────────── publish my camera / microphone / screen ───────────── */

  private emitLocal() {
    this.h.onLocal?.({ camera: liveVideo(this.camStream), screen: this.screenStream });
    this.me = { ...this.me, micOn: !!this.camStream?.getAudioTracks().length, camOn: !!this.camStream?.getVideoTracks().length };
    this.emitPeople();
  }

  private needRtc() {
    if (!rtcAvailable()) throw new Error('This browser cannot share audio or video.');
  }

  async setMic(on: boolean) {
    this.needRtc();
    if (!on) {
      this.camStream?.getAudioTracks().forEach((t) => (t.stop(), this.camStream!.removeTrack(t)));
    } else if (!this.camStream?.getAudioTracks().length) {
      const s = await getUserMediaChecked({ audio: { echoCancellation: true, noiseSuppression: true } }, ['microphone']);
      this.camStream ??= new MediaStream();
      s.getAudioTracks().forEach((t) => this.camStream!.addTrack(t));
    }
    this.afterLocalChange();
  }

  async setCam(on: boolean) {
    this.needRtc();
    if (!on) {
      this.camStream?.getVideoTracks().forEach((t) => (t.stop(), this.camStream!.removeTrack(t)));
    } else if (!this.camStream?.getVideoTracks().length) {
      const s = await getUserMediaChecked({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } }, ['camera']);
      this.camStream ??= new MediaStream();
      s.getVideoTracks().forEach((t) => this.camStream!.addTrack(t));
    }
    this.afterLocalChange();
  }

  async setScreen(on: boolean) {
    this.needRtc();
    if (!this.me.isHost) throw new Error('Only the instructor can share a screen.');
    if (!on) {
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    } else if (!this.screenStream) {
      let s: MediaStream;
      try {
        s = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({ video: true, audio: true });
      } catch (e) {
        throw await explainMediaError(e, 'screen');
      }
      this.screenStream = s;
      // the browser's own "Stop sharing" button
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.screenStream = null;
        this.afterLocalChange();
      });
    }
    this.afterLocalChange();
  }

  private afterLocalChange() {
    this.emitLocal();
    this.scheduleSync();
  }

  /** Several changes in a row (audio track, then video track…) are applied together. */
  private scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      if (this.me.isHost) this.syncAllDown();
      else this.syncUp();
    }, 150);
  }

  private syncAllDown() {
    this.peers.forEach((p, id) => !p.isHost && this.syncPeer(id));
  }

  /** Make the connection carry exactly these tracks. If the set changed, replace the connection with a fresh one. */
  private publish(id: string, dir: Dir, want: { track: MediaStreamTrack; stream: MediaStream }[]) {
    const k = key(id, dir);
    const sig = want.map((w) => w.track.id).sort().join(',');
    if ((this.sigs.get(k) ?? '') === sig) return; // nothing changed
    this.sigs.set(k, sig);
    this.pcs.get(k)?.close();
    this.pcs.delete(k);
    this.pendingIce.delete(k);
    if (!want.length) {
      this.post({ k: 'rtc', to: id, from: this.me.id, dir, gen: 0, kind: 'bye', data: null }); // tell the other side to let go
      return;
    }
    this.gens.set(k, (this.gens.get(k) ?? 0) + 1);
    const pc = this.newPc(id, dir);
    want.forEach((w) => pc.addTrack(w.track, w.stream)); // triggers the offer
  }

  /** Host: this learner's "down" connection carries my camera, mic, screen and any learner who is speaking (except themselves). */
  private syncPeer(id: string) {
    if (!this.me.isHost || !rtcAvailable()) return;
    const want: { track: MediaStreamTrack; stream: MediaStream }[] = [];
    for (const st of [this.camStream, this.screenStream]) st?.getTracks().forEach((track) => want.push({ track, stream: st }));
    this.speakers.forEach((sp, sid) => {
      if (sid !== id) sp.stream.getTracks().forEach((track) => track.readyState === 'live' && want.push({ track, stream: sp.stream }));
    });
    this.publish(id, 'down', want);
  }

  /** Learner: my "up" connection to the host carries my mic/camera (the host only answers if it allowed me). */
  private syncUp() {
    if (this.me.isHost || !rtcAvailable()) return;
    const host = [...this.peers.values()].find((p) => p.isHost);
    if (!host) return;
    const want: { track: MediaStreamTrack; stream: MediaStream }[] = [];
    this.camStream?.getTracks().forEach((track) => want.push({ track, stream: this.camStream! }));
    this.publish(host.id, 'up', want);
  }

  private metaFor(forId: string): Meta {
    const first = [...this.speakers.entries()].find(([sid, sp]) => sid !== forId && liveAny(sp.stream));
    return { cam: this.camStream?.id, screen: this.screenStream?.id, ...(first ? { spk: { id: first[0], name: first[1].name, stream: first[1].stream.id } } : {}) };
  }

  private newPc(id: string, dir: Dir) {
    // same device / same network: host candidates are enough, no external STUN server is contacted
    const pc = new RTCPeerConnection({ iceServers: [] });
    const k = key(id, dir);
    this.pcs.set(k, pc);
    const iAmOfferer = (dir === 'down') === this.me.isHost; // host offers "down", the learner offers "up"
    const gen = () => (iAmOfferer ? this.gens.get(k) : this.recvGen.get(k)) ?? 0;
    pc.onicecandidate = (ev) => ev.candidate && this.post({ k: 'rtc', to: id, from: this.me.id, dir, gen: gen(), kind: 'ice', data: ev.candidate.toJSON() });
    if (iAmOfferer) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.post({ k: 'rtc', to: id, from: this.me.id, dir, gen: gen(), kind: 'offer', data: pc.localDescription!.toJSON(), meta: dir === 'down' ? this.metaFor(id) : undefined });
        } catch {
          /* connection closed while negotiating */
        }
      };
    }
    if (dir === 'down' && !this.me.isHost) pc.ontrack = (ev) => this.onRemoteTrack(ev);
    if (dir === 'up' && this.me.isHost) pc.ontrack = (ev) => this.onUpTrack(id, ev);
    return pc;
  }

  /** Host: stop playing a learner's previous audio so the next connection can play afresh. */
  private forgetSpeaker(id: string) {
    const old = this.speakers.get(id);
    if (old) {
      this.audioEls.get(old.stream.id)?.remove();
      this.audioEls.delete(old.stream.id);
    }
    this.speakers.delete(id);
  }

  /** Learner: forget the host's old streams (a new connection is about to replace them). */
  private clearIncoming() {
    this.incoming.clear();
    this.audioEls.forEach((el) => el.remove());
    this.audioEls.clear();
  }

  private async onSignal(e: Extract<Env, { k: 'rtc' }>) {
    const dir = e.dir ?? 'down';
    const k = key(e.from, dir);
    const iAmOfferer = (dir === 'down') === this.me.isHost;

    if (e.kind === 'bye') {
      // the sender stopped sending everything on this connection
      this.pcs.get(k)?.close();
      this.pcs.delete(k);
      this.pendingIce.delete(k);
      this.recvGen.delete(k);
      if (dir === 'down' && !this.me.isHost) {
        this.clearIncoming();
        this.meta = {};
        this.emitRemote();
      }
      if (dir === 'up' && this.me.isHost) this.dropSpeaker(e.from);
      return;
    }

    if (e.kind === 'offer' && !iAmOfferer) {
      // the host only accepts a learner's upstream if it allowed that learner to speak
      if (dir === 'up' && !this.allowed.has(e.from)) return;
      if (e.gen < (this.recvGen.get(k) ?? 0)) return; // an older offer that arrived late
      this.recvGen.set(k, e.gen);
      this.pcs.get(k)?.close(); // the new generation replaces the old connection
      this.pcs.delete(k);
      this.pendingIce.delete(k);
      if (dir === 'down') {
        this.clearIncoming();
        this.meta = e.meta ?? {};
      } else this.forgetSpeaker(e.from);
      const pc = this.newPc(e.from, dir);
      await pc.setRemoteDescription(e.data);
      await this.drainIce(k, pc);
      await pc.setLocalDescription(await pc.createAnswer());
      this.post({ k: 'rtc', to: e.from, from: this.me.id, dir, gen: e.gen, kind: 'answer', data: pc.localDescription!.toJSON() });
      if (dir === 'down') this.emitRemote();
    } else if (e.kind === 'answer' && iAmOfferer) {
      const pc = this.pcs.get(k);
      if (!pc || e.gen !== this.gens.get(k)) return; // an answer for a connection I already replaced
      await pc.setRemoteDescription(e.data);
      await this.drainIce(k, pc);
    } else if (e.kind === 'ice') {
      if (e.gen !== (iAmOfferer ? this.gens.get(k) : this.recvGen.get(k))) return; // belongs to a replaced connection
      const pc = this.pcs.get(k);
      if (pc?.remoteDescription) await pc.addIceCandidate(e.data).catch(() => {});
      else this.pendingIce.set(k, [...(this.pendingIce.get(k) ?? []), e.data]);
    }
  }

  private async drainIce(k: string, pc: RTCPeerConnection) {
    const q = this.pendingIce.get(k) ?? [];
    this.pendingIce.delete(k);
    for (const c of q) await pc.addIceCandidate(c).catch(() => {});
  }

  /* ───────────── receiving ───────────── */

  /** Learner: the host's video/audio, plus the learner the host let speak. */
  private onRemoteTrack(ev: RTCTrackEvent) {
    const stream = ev.streams[0];
    if (!stream) return;
    this.incoming.set(stream.id, stream);
    const refresh = () => this.emitRemote();
    stream.addEventListener('removetrack', refresh);
    ev.track.addEventListener('ended', refresh);
    ev.track.addEventListener('mute', refresh);
    ev.track.addEventListener('unmute', refresh);
    if (ev.track.kind === 'audio') this.playAudio(stream);
    this.emitRemote();
  }

  private emitRemote() {
    const spkStream = this.meta.spk ? this.incoming.get(this.meta.spk.stream) : undefined;
    this.h.onVideo({
      hostCamera: liveVideo(this.meta.cam ? this.incoming.get(this.meta.cam) : undefined),
      hostScreen: liveVideo(this.meta.screen ? this.incoming.get(this.meta.screen) : undefined),
      speaker: this.meta.spk && liveAny(spkStream) ? { name: this.meta.spk.name, stream: liveVideo(spkStream) } : null,
    });
  }

  /** Host: a learner who was allowed to speak is now sending audio/video. Play it and relay it to the other learners. */
  private onUpTrack(id: string, ev: RTCTrackEvent) {
    const stream = ev.streams[0];
    if (!stream) return;
    this.speakers.set(id, { name: this.peers.get(id)?.name ?? 'Learner', stream });
    const refresh = () => {
      if (!liveAny(stream)) this.speakers.delete(id);
      this.emitSpeaker();
      this.scheduleSync();
    };
    stream.addEventListener('removetrack', refresh);
    ev.track.addEventListener('ended', refresh);
    if (ev.track.kind === 'audio') this.playAudio(stream);
    this.emitSpeaker();
    this.scheduleSync();
  }

  private emitSpeaker() {
    const first = [...this.speakers.values()].find((s) => liveAny(s.stream));
    this.h.onVideo({ hostCamera: null, hostScreen: null, speaker: first ? { name: first.name, stream: liveVideo(first.stream) } : null });
  }

  /** The host takes speaking permission back: close that learner's upstream and stop relaying them. */
  private dropSpeaker(id: string) {
    this.pcs.get(key(id, 'up'))?.close();
    this.pcs.delete(key(id, 'up'));
    if (this.speakers.has(id)) {
      this.forgetSpeaker(id);
      this.emitSpeaker();
      this.scheduleSync();
    }
  }

  /** Remote audio plays through a hidden element; if the browser blocks autoplay, the first tap anywhere starts it. */
  private playAudio(stream: MediaStream) {
    if (typeof document === 'undefined' || this.audioEls.has(stream.id)) return;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    el.srcObject = stream;
    document.body.appendChild(el);
    this.audioEls.set(stream.id, el);
    el.play().catch(() => {
      const resume = () => el.play().catch(() => {});
      document.addEventListener('pointerdown', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    });
  }

  /** A peer joined again (page refresh, reconnect): throw away what was left of its old connection. */
  private resetPeer(p: PersonInfo) {
    this.closePeer(p.id);
    if (p.isHost && !this.me.isHost) {
      // the instructor's room restarted: forget its old streams and give up speaking (the new room has not allowed anyone yet)
      this.incoming.clear();
      this.audioEls.forEach((el) => el.remove());
      this.audioEls.clear();
      this.meta = {};
      this.emitRemote();
      if (this.camStream?.getTracks().length) {
        this.camStream.getTracks().forEach((t) => t.stop());
        this.camStream = null;
        this.emitLocal();
        this.h.onMsg({ t: 'allow_speak', who: this.me.id, on: false }, p);
      }
    }
  }

  private closePeer(id: string) {
    (['down', 'up'] as Dir[]).forEach((d) => {
      this.pcs.get(key(id, d))?.close();
      this.pcs.delete(key(id, d));
      this.pendingIce.delete(key(id, d));
      this.sigs.delete(key(id, d));
      this.recvGen.delete(key(id, d));
    });
    this.allowed.delete(id);
    if (this.speakers.has(id)) {
      this.forgetSpeaker(id);
      this.emitSpeaker();
      this.scheduleSync();
    }
  }

  async disconnect() {
    this.post({ k: 'leave', id: this.me.id });
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.pcs.forEach((pc) => pc.close());
    this.pcs.clear();
    this.sigs.clear();
    this.gens.clear();
    this.recvGen.clear();
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.camStream = this.screenStream = null;
    this.audioEls.forEach((el) => el.remove());
    this.audioEls.clear();
    this.incoming.clear();
    this.speakers.clear();
    this.allowed.clear();
    this.ch?.close();
    this.ch = null;
    this.peers.clear();
    this.h.onState('disconnected');
  }
}
