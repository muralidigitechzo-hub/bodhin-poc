// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* 1-on-1 call: tutor (host) and learner (student) in the same room through the same room layer the app uses. */
import { db } from '@/api/mockDb';
import { mentorship } from '@/api/mentorship';
import { LoopbackRoom } from '@/live/loopback'; // what createRoom('loopback', …) returns
import type { RoomMsg } from '@/live/protocol';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
/** Lets BroadcastChannel deliveries (several hops) settle: many event-loop turns, independent of the stubbed timers. */
const sleep = async () => { for (let i = 0; i < 60; i++) await new Promise((r) => setImmediate(r)); };

function client(role: 'host' | 'student', userId: string, name: string, room: string) {
  const got: { m: RoomMsg; from: any }[] = [];
  let people: any[] = [];
  let state = '';
  const rm = new LoopbackRoom({ onMsg: (m, from) => got.push({ m, from }), onPeople: (p) => (people = p), onState: (s) => (state = s), onVideo: () => {} }, { sessionId: room, userId, name, isHost: role === 'host' });
  return { rm, got, people: () => people, state: () => state };
}

// a real booking, so the room name and the two tokens come from the same API the screens use
const NOW = new Date(2026, 10, 12, 10, 0);
db.mentorConfigs = []; db.mentorSlots = []; db.mentorBookings = [];
mentorship.publish('u_meera', { slotMins: 30, windows: [{ day: 4, start: '18:00', end: '19:00' }], topics: ['debugging'] }, NOW);
const slot = mentorship.slots('u_arjun', 'u_meera', NOW).slots[0];
const b = mentorship.book('u_arjun', slot.id, { topic: 'debugging' }, NOW);
const at = new Date(new Date(b.startsAt).getTime() - 5 * 60000);
const th = mentorship.join('u_meera', b.id, at);
const ts = mentorship.join('u_arjun', b.id, at);
ok(th.room === ts.room && th.provider === 'loopback', 'both people are given the same room', { a: th.room, b: ts.room });

(async () => {
  const tutor = client('host', 'u_meera', th.name, th.room);
  const learner = client('student', 'u_arjun', ts.name, ts.room);
  await tutor.rm.connect(th.url, th.token);
  await sleep();
  ok(tutor.state() === 'connected', 'tutor connects');
  ok(tutor.people().length === 1, 'tutor is alone until the learner arrives', tutor.people().length);
  await learner.rm.connect(ts.url, ts.token);
  await sleep();
  ok(learner.state() === 'connected', 'learner connects');
  ok(tutor.people().some((p) => p.id === 'u_arjun' && !p.isHost), 'tutor sees the learner arrive');
  ok(learner.people().some((p) => p.id === 'u_meera' && p.isHost), 'learner sees the tutor, marked as host');

  await learner.rm.send({ t: 'chat', id: 'c1', by: ts.name, text: 'Hi, my loop never ends', at: 1 });
  await sleep();
  ok(tutor.got.some((g) => g.m.t === 'chat' && g.m.text === 'Hi, my loop never ends' && g.from.id === 'u_arjun'), 'tutor receives the learner’s chat');
  await tutor.rm.send({ t: 'chat', id: 'c2', by: th.name, text: 'Share the code, I’ll take a look', at: 2 });
  await sleep();
  ok(learner.got.some((g) => g.m.t === 'chat' && g.m.text.startsWith('Share the code') && g.from.isHost), 'learner receives the tutor’s chat');
  ok(!learner.got.some((g) => g.m.id === 'c1') && !tutor.got.some((g) => g.m.id === 'c2'), 'nobody receives their own message back');

  await learner.rm.send({ t: 'end' }); // host-only message from a learner
  await learner.rm.send({ t: 'stage', mode: 'screen' });
  await sleep();
  ok(!tutor.got.some((g) => g.m.t === 'end' || g.m.t === 'stage'), 'host-only messages from the learner are dropped');
  await tutor.rm.send({ t: 'record', on: true });
  await sleep();
  ok(learner.got.some((g) => g.m.t === 'record'), 'host-only messages from the tutor are delivered');

  // a different booking's room is separate
  const other = client('student', 'u_x', 'Someone Else', 'mentor-other-booking');
  await other.rm.connect('', 't');
  await learner.rm.send({ t: 'chat', id: 'c3', by: ts.name, text: 'private', at: 3 });
  await sleep();
  ok(!other.got.some((g) => g.m.t === 'chat'), 'a different session’s room never sees this conversation');

  // media honesty in the preview (no fake audio/video)
  let mic = '';
  try { await tutor.rm.setMic(true); } catch (e: any) { mic = e.message; }
  ok(/media server/i.test(mic), 'microphone fails honestly without the media server', mic);

  await learner.rm.disconnect();
  await sleep();
  ok(tutor.people().every((p) => p.id !== 'u_arjun'), 'tutor sees the learner leave');
  ok(learner.state() === 'disconnected', 'learner state becomes disconnected');
  await tutor.rm.disconnect();
  await other.rm.disconnect();

  console.log(`mentor-call: ${pass} passed, ${fail} failed`);
  if (fail) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
