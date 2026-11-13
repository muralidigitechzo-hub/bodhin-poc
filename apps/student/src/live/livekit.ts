/**
 * LiveKit adapter (Apache-2.0, self-hosted). Thin: connect, publish tracks, send/receive RoomMsg.
 * No LiveKit UI components are used — only the headless `livekit-client` SDK — so nothing of LiveKit
 * is ever drawn on screen. Web works as-is. Native (iOS/Android) additionally needs
 * `@livekit/react-native` + `@livekit/react-native-webrtc` in an EAS dev build (not Expo Go); call
 * `await prepareNative()` once before connect (it is a no-op on web).
 */
import { Platform } from 'react-native';
import { Room, RoomEvent, Track, ConnectionState, type RemoteParticipant, type Participant } from 'livekit-client';
import { decodeMsg, encodeMsg, isAllowedFrom, type RoomMsg, type RoomRole } from './protocol';

export interface PersonInfo {
  id: string;
  name: string;
  isHost: boolean;
  speaking: boolean;
  micOn: boolean;
  camOn: boolean;
}

export interface VideoStreams {
  hostCamera: MediaStream | null;
  hostScreen: MediaStream | null;
  /** `peerCamera` = the first non-host participant's camera in a 1-on-1 call. Classes ignore it. */
  peerCamera?: MediaStream | null;
  /** A learner the host let speak in live class (video is null when only their mic is on). */
  speaker?: { name: string; stream: MediaStream | null } | null;
}

export interface RoomHandlers {
  onMsg: (m: RoomMsg, from: PersonInfo) => void;
  onPeople: (p: PersonInfo[]) => void;
  onState: (s: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  onVideo: (v: VideoStreams) => void;
  /** The host's own camera / screen, for a local preview (host side only). */
  onLocal?: (v: { camera: MediaStream | null; screen: MediaStream | null }) => void;
}

export async function prepareNative() {
  if (Platform.OS === 'web') return;
  try {
    const mod = require('@livekit/react-native'); // eslint-disable-line @typescript-eslint/no-var-requires
    mod.registerGlobals();
  } catch {
    throw new Error('Live classes on mobile need the Bodhin development build (native WebRTC).');
  }
}

const roleOf = (p: Participant): RoomRole => {
  try {
    return JSON.parse(p.metadata || '{}').role === 'host' ? 'host' : 'student';
  } catch {
    return 'student';
  }
};

const info = (p: Participant): PersonInfo => ({
  id: p.identity,
  name: p.name || p.identity,
  isHost: roleOf(p) === 'host',
  speaking: p.isSpeaking,
  micOn: p.isMicrophoneEnabled,
  camOn: p.isCameraEnabled,
});

export class RoomClient {
  private room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
  constructor(private h: RoomHandlers) {}

  async connect(url: string, token: string) {
    const r = this.room;
    const people = () => this.h.onPeople([info(r.localParticipant), ...Array.from(r.remoteParticipants.values()).map(info)]);
    const video = () => {
      let cam: MediaStream | null = null;
      let scr: MediaStream | null = null;
      let peer: MediaStream | null = null;
      r.remoteParticipants.forEach((p) => {
        if (roleOf(p) !== 'host') {
          const pc = p.getTrackPublication(Track.Source.Camera)?.track;
          if (!peer && pc?.mediaStream) peer = pc.mediaStream;
          return;
        }
        const c = p.getTrackPublication(Track.Source.Camera)?.track;
        const s = p.getTrackPublication(Track.Source.ScreenShare)?.track;
        if (c?.mediaStream) cam = c.mediaStream;
        if (s?.mediaStream) scr = s.mediaStream;
      });
      this.h.onVideo({ hostCamera: cam, hostScreen: scr, peerCamera: peer });
    };
    r.on(RoomEvent.ConnectionStateChanged, (s) =>
      this.h.onState(s === ConnectionState.Connected ? 'connected' : s === ConnectionState.Reconnecting ? 'reconnecting' : s === ConnectionState.Disconnected ? 'disconnected' : 'connecting'),
    );
    r.on(RoomEvent.ParticipantConnected, people)
      .on(RoomEvent.ParticipantDisconnected, people)
      .on(RoomEvent.ActiveSpeakersChanged, people)
      .on(RoomEvent.TrackMuted, people)
      .on(RoomEvent.TrackUnmuted, people)
      .on(RoomEvent.TrackSubscribed, (t) => {
        // Remote audio must be attached to an element on web (native handles it via registerGlobals).
        if (t.kind === Track.Kind.Audio && Platform.OS === 'web') {
          const el = t.attach();
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        video();
      })
      .on(RoomEvent.TrackUnsubscribed, (t) => {
        t.detach().forEach((el) => el.remove());
        video();
      })
      .on(RoomEvent.DataReceived, (data: Uint8Array, from?: RemoteParticipant) => {
        const m = decodeMsg(data);
        if (!m || !from) return;
        if (!isAllowedFrom(m, roleOf(from))) return; // students cannot send host-only messages
        this.h.onMsg(m, info(from));
      });
    await r.connect(url, token);
    people();
    video();
  }

  /** Reliable delivery for chat/Q&A/poll; lossy for high-rate whiteboard strokes. */
  send(m: RoomMsg) {
    const lossy = m.t === 'stroke';
    return this.room.localParticipant.publishData(encodeMsg(m), { reliable: !lossy });
  }
  setMic(on: boolean) {
    return this.room.localParticipant.setMicrophoneEnabled(on);
  }
  setCam(on: boolean) {
    return this.room.localParticipant.setCameraEnabled(on);
  }
  setScreen(on: boolean) {
    return this.room.localParticipant.setScreenShareEnabled(on);
  }
  disconnect() {
    return this.room.disconnect();
  }
}
