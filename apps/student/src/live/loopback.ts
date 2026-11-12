/**
 * Loopback room — same interface as the LiveKit adapter, but messages travel over a browser BroadcastChannel,
 * so a host tab and a learner tab on the same device behave like one real classroom (chat, Q&A, polls, quizzes,
 * whiteboard, hands, reactions, files, stage). There is NO fake content: nothing appears unless a real participant sends it.
 * Audio, camera and screen sharing need the media server, so those calls fail honestly here.
 */
import { decodeMsg, encodeMsg, isAllowedFrom, type RoomMsg } from './protocol';
import type { PersonInfo, RoomHandlers } from './livekit';

type Env =
  | { k: 'msg'; from: PersonInfo; body: string }
  | { k: 'join'; p: PersonInfo }
  | { k: 'here'; to: string; p: PersonInfo }
  | { k: 'leave'; id: string };

export interface LoopbackCtx {
  sessionId: string;
  userId: string;
  name: string;
  isHost: boolean;
}

export const loopbackAvailable = () => typeof BroadcastChannel !== 'undefined';

export class LoopbackRoom {
  private ch: BroadcastChannel | null = null;
  private peers = new Map<string, PersonInfo>();
  private me: PersonInfo;
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
        this.peers.set(e.p.id, e.p);
        this.post({ k: 'here', to: e.p.id, p: this.me });
        this.emitPeople();
      } else if (e.k === 'here' && e.to === this.me.id && e.p?.id) {
        this.peers.set(e.p.id, e.p);
        this.emitPeople();
      } else if (e.k === 'leave') {
        this.peers.delete(e.id);
        this.emitPeople();
      } else if (e.k === 'msg' && e.from?.id && e.from.id !== this.me.id) {
        const m = decodeMsg(e.body);
        if (!m) return;
        const known = this.peers.get(e.from.id);
        const from = known ?? e.from;
        // the role is whatever this peer announced when it joined — a message cannot promote its sender
        if (!isAllowedFrom(m, from.isHost ? 'host' : 'student')) return;
        this.h.onMsg(m, from);
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
    this.post({ k: 'msg', from: this.me, body: new TextDecoder().decode(encodeMsg(m)) });
  }
  async setMic(_on: boolean) {
    throw new Error('Audio needs the live media server.');
  }
  async setCam(_on: boolean) {
    throw new Error('Video needs the live media server.');
  }
  async setScreen(_on: boolean) {
    throw new Error('Screen sharing needs the live media server.');
  }
  async disconnect() {
    this.post({ k: 'leave', id: this.me.id });
    this.ch?.close();
    this.ch = null;
    this.peers.clear();
    this.h.onState('disconnected');
  }
}
