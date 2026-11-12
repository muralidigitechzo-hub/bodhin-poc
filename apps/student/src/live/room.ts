/** One factory for both transports so screens never care which one is running. */
import { RoomClient, type RoomHandlers } from './livekit';
import { LoopbackRoom, type LoopbackCtx } from './loopback';
import type { RoomMsg } from './protocol';

export type Provider = 'livekit' | 'loopback';

export interface RoomLike {
  connect(url: string, token: string): Promise<void>;
  send(m: RoomMsg): Promise<unknown> | unknown;
  setMic(on: boolean): Promise<unknown>;
  setCam(on: boolean): Promise<unknown>;
  setScreen(on: boolean): Promise<unknown>;
  disconnect(): Promise<unknown> | unknown;
}

export function createRoom(provider: Provider, handlers: RoomHandlers, ctx: LoopbackCtx): RoomLike {
  return provider === 'livekit' ? (new RoomClient(handlers) as unknown as RoomLike) : (new LoopbackRoom(handlers, ctx) as unknown as RoomLike);
}
