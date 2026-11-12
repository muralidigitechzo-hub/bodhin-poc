// @ts-nocheck — Node-only test (uses fs/path); executed by tests/business/run.sh
/* Live room: protocol validation, host-only enforcement, rate limit, token grants, join window, and the
   "no third-party branding on screen" guarantee (scans the UI source). */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { HOST_ONLY, decodeMsg, encodeMsg, grantFor, isAllowedFrom, joinWindow, makeRateLimiter, roomName, strokePath, type RoomMsg } from '@/live/protocol';
import { LoopbackRoom } from '@/live/loopback';
import { liveTab } from '@/api/client';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

/* round-trip every message type */
const samples: RoomMsg[] = [
  { t: 'chat', id: 'm1', by: 'Arjun', text: 'hello', at: 1 }, { t: 'qa', id: 'q1', by: 'Arjun', text: 'why?', at: 2 }, { t: 'qa_answer', id: 'q1', text: 'because' },
  { t: 'hand', by: 'Arjun', up: true }, { t: 'react', by: 'Arjun', emoji: '🔥' }, { t: 'poll', id: 'p1', q: 'Pick', options: ['a', 'b'] },
  { t: 'vote', pollId: 'p1', option: 1, by: 'Arjun' }, { t: 'poll_close', id: 'p1' }, { t: 'slide', index: 3 },
  { t: 'stroke', color: '#fff', w: 3, pts: [[0.1, 0.2], [0.3, 0.4]] }, { t: 'board_clear' }, { t: 'allow_speak', who: 'u1', on: true },
  { t: 'poll', id: 'p2', q: 'Capital of India?', options: ['Delhi', 'Mumbai'], quiz: true }, { t: 'poll_result', id: 'p2', votes: [3, 1] }, { t: 'poll_close', id: 'p2', votes: [3, 1], correct: 0 },
  { t: 'slide', index: 1, title: 'Agenda', sub: 'Three topics', total: 6 }, { t: 'stage', mode: 'board' }, { t: 'file', id: 'f1', name: 'notes.pdf', size: 2048, url: 'https://x.test/n.pdf' },
  { t: 'record', on: true }, { t: 'hello', by: 'Arjun' }, { t: 'end' },
];
for (const m of samples) ok(JSON.stringify(decodeMsg(encodeMsg(m))) === JSON.stringify(m), `round-trip ${m.t}`);

/* hostile / malformed input is dropped */
const bad: unknown[] = ['not json', '{}', '{"t":"nope"}', { t: 'chat', id: 'x', by: 'a', text: '', at: 1 }, { t: 'chat', id: 'x', by: 'a', text: 'x'.repeat(501), at: 1 },
  { t: 'react', by: 'a', emoji: '💣' }, { t: 'poll', id: 'p', q: 'q', options: ['only one'] }, { t: 'poll', id: 'p', q: 'q', options: Array(7).fill('x') },
  { t: 'vote', pollId: 'p', option: -1, by: 'a' }, { t: 'vote', pollId: 'p', option: 1.5, by: 'a' }, { t: 'slide', index: 99999 },
  { t: 'stroke', color: '#fff', w: 999, pts: [[1, 2]] }, { t: 'stroke', color: '#fff', w: 2, pts: Array(401).fill([1, 1]) }, { t: 'stroke', color: '#fff', w: 2, pts: [['a', 1]] }, null, 42,
  { t: 'poll_result', id: 'p', votes: [1] }, { t: 'poll_result', id: 'p', votes: [1, -2] }, { t: 'poll_close', id: 'p', correct: 9 }, { t: 'stage', mode: 'cinema' },
  { t: 'file', id: 'f', name: '', size: 1, url: 'u' }, { t: 'file', id: 'f', name: 'a', size: -1, url: 'u' }, { t: 'slide', index: 1, total: 0 }, { t: 'record', on: 'yes' }];
bad.forEach((b, i) => ok(decodeMsg(typeof b === 'string' ? b : JSON.stringify(b)) === null, `rejects malformed #${i}`));

/* students cannot send host-only messages */
const hostOnly: RoomMsg[] = samples.filter((m) => HOST_ONLY.has(m.t));
ok(new Set(hostOnly.map((m) => m.t)).size === 12 && HOST_ONLY.size === 12, 'twelve host-only types, all covered by samples');
hostOnly.forEach((m) => { ok(!isAllowedFrom(m, 'student'), `student blocked from ${m.t}`); ok(isAllowedFrom(m, 'host'), `host may send ${m.t}`); });
['chat', 'qa', 'hand', 'react', 'vote', 'hello'].forEach((t) => ok(isAllowedFrom(samples.find((m) => m.t === t)!, 'student'), `student may send ${t}`));

/* rate limit: 5 per 5s per sender, independent senders, window slides */
const rl = makeRateLimiter(5, 5000);
const r1 = Array.from({ length: 7 }, (_, i) => rl('a', 1000 + i));
ok(r1.filter(Boolean).length === 5 && !r1[5] && !r1[6], 'sixth chat within 5s is blocked');
ok(rl('b', 1100), 'other sender unaffected');
ok(rl('a', 7000), 'allowed again after the window');

/* token grants */
const host = grantFor('host', 'T:S', 'h1', 'Rajesh');
const stu = grantFor('student', 'T:S', 's1', 'Arjun');
const stuOk = grantFor('student', 'T:S', 's1', 'Arjun', true);
const rec = grantFor('recorder', 'T:S', 'rec', 'Recorder');
ok(host.canPublish && host.canPublishSources.includes('screen_share'), 'host publishes mic, camera, screen');
ok(!stu.canPublish && stu.canPublishSources.length === 0 && stu.canPublishData && stu.canSubscribe, 'student joins listen-only but can chat');
ok(stuOk.canPublish && stuOk.canPublishSources.join() === 'microphone,camera' && !stuOk.canPublishSources.includes('screen_share'), 'approved student gets mic+camera, never screen share');
ok(rec.hidden && !rec.canPublish && !rec.canPublishData, 'recorder is hidden and silent');
ok(roomName('t_a', 's1') !== roomName('t_b', 's1'), 'room names are tenant-scoped');

/* join window */
const start = Date.UTC(2026, 0, 1, 10), end = start + 3600_000;
ok(joinWindow(start, end, start - 11 * 60_000) === 'too_early', 'too early (11 min)');
ok(joinWindow(start, end, start - 9 * 60_000) === 'ok', 'opens at 10 min before');
ok(joinWindow(start, end, end + 20 * 60_000) === 'ok', '30-min overrun grace');
ok(joinWindow(start, end, end + 31 * 60_000) === 'ended', 'ended after grace');

/* a quiz never leaks its answer before it is closed */
const quizPoll = samples.find((m) => m.t === 'poll' && (m as { quiz?: boolean }).quiz)!;
ok(!('correct' in quizPoll), 'quiz poll message carries no answer');
ok(strokePath([[0.5, 0.5]]).includes('L'), 'a single tap still draws a dot');

/* ── loopback classroom: host + learners exchange every non-media feature; nothing is simulated ── */
// run.sh stubs setTimeout to fire immediately, so wait on the real event loop (setImmediate) instead
const sleep = async (ms: number) => { const t = Date.now(); while (Date.now() - t < ms) await new Promise<void>((r) => setImmediate(r)); };
const noop = () => {};
const asyncPart = (async () => {
const got = { host: [] as RoomMsg[], a: [] as RoomMsg[], b: [] as RoomMsg[] };
let peopleSeen = 0;
const mk = (key: 'host' | 'a' | 'b', id: string, name: string, isHost: boolean) =>
  new LoopbackRoom({ onState: noop, onVideo: noop, onPeople: (p) => { if (key === 'host') peopleSeen = p.length; }, onMsg: (m) => got[key].push(m) }, { sessionId: 'sess1', userId: id, name, isHost });
const H = mk('host', 'h1', 'Rajesh', true), A = mk('a', 'u1', 'Arjun', false), B = mk('b', 'u2', 'Divya', false);
await H.connect(); await A.connect(); await B.connect(); await sleep(60);
ok(peopleSeen === 3, 'host sees both learners in the room', peopleSeen);
await A.send({ t: 'chat', id: 'c1', by: 'Arjun', text: 'hello class', at: 1 }); await sleep(40);
ok(got.host.some((m) => m.t === 'chat') && got.b.some((m) => m.t === 'chat'), 'chat reaches host and the other learner');
await A.send({ t: 'hello', by: 'Arjun' }); await sleep(40);
ok(got.host.some((m) => m.t === 'hello'), 'hello reaches the host (late-join replay trigger)');
await H.send({ t: 'poll', id: 'p9', q: 'Pick one', options: ['a', 'b'], quiz: true }); await H.send({ t: 'poll_result', id: 'p9', votes: [0, 1] }); await sleep(40);
ok(got.a.some((m) => m.t === 'poll') && got.a.some((m) => m.t === 'poll_result'), 'host poll and live tally reach learners');
await H.send({ t: 'file', id: 'f9', name: 'slides.pdf', size: 4096, url: 'https://x.test/s.pdf' }); await sleep(40);
ok(got.b.some((m) => m.t === 'file'), 'shared file reaches learners');
await H.send({ t: 'stroke', color: '#000', w: 5, pts: [[0.1, 0.1], [0.2, 0.2]] }); await sleep(40);
ok(got.a.some((m) => m.t === 'stroke'), 'whiteboard stroke reaches learners');
const before = got.b.length;
await A.send({ t: 'poll', id: 'evil', q: 'Hijack', options: ['x', 'y'] }); await A.send({ t: 'slide', index: 0 }); await A.send({ t: 'end' }); await sleep(60);
ok(got.b.length === before && !got.host.some((m) => m.t === 'poll' || m.t === 'end'), 'a learner cannot post polls, slides or end the class');
await H.send({ t: 'end' }); await sleep(40);
ok(got.a.some((m) => m.t === 'end'), 'host can end the class for everyone');
let denied = false; try { await A.setMic(true); } catch { denied = true; }
ok(denied, 'audio honestly reports it needs the media server');
await A.disconnect(); await sleep(40);
ok(peopleSeen === 2, 'host sees a learner leave', peopleSeen);
await H.disconnect(); await B.disconnect();

/* ── student join / attendance / recording rules ── */
const j = await liveTab.join('u_arjun', 'ls_now');
ok(j.provider === 'loopback' && !('participants' in j), 'join returns a real provider, no invented viewer count');
const pastBefore = (await liveTab.schedule('u_arjun', null)).past.length;
liveTab.heartbeat('u_arjun', 'ls_now'); liveTab.heartbeat('u_arjun', 'ls_now');
liveTab.leave('u_arjun', 'ls_now', 1);
const sched = await liveTab.schedule('u_arjun', null);
ok(sched.past.every((r) => !r.session.id.startsWith('lp_')), 'no invented past classes');
ok(pastBefore === sched.past.length, 'a class that is still running is not in Past yet');
ok(sched.liveNow.some((r) => r.session.id === 'ls_now' && r.attended), 'a learner who stayed counts as attended');
ok(liveTab.recording('u_arjun', 'ls_now')?.recording.state === 'none', 'no recording until a class is recorded');
ok(liveTab.recording('u_nobody', 'ls_now') === null, 'only enrolled learners open a recording');
/* the list and the recording page must agree on attendance (report bug: list "Attended", detail "Missed") */
const mismatches = sched.past.filter((r) => { const d = liveTab.recording('u_arjun', r.session.id); return !d || d.attended !== r.attended || (d.attendance?.minutes ?? 0) !== (r.attendance?.minutes ?? 0); }).map((r) => r.session.id);
ok(sched.past.length > 0 && mismatches.length === 0, 'recording page shows the same attendance as the list for every past class', mismatches);
ok(sched.past.every((r) => ['ready', 'processing', 'unavailable', 'none'].includes(r.recording.state)), 'every past class has a clear recording state');
})();

/* ── branding guarantee: no provider name in user-visible strings ── */
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx)$/.test(p) ? [p] : []; });
// 'Powered by Bodhin' is the tenant white-label toggle (our own brand); "zoom in" is a sample chat line; provider ids in code are not rendered.
const banned = /(livekit|jitsi|bigbluebutton|big blue button|agora|twilio|\bzoom\b(?! in)|powered by(?! bodhin)|watermark)/i;
const offenders: string[] = [];
for (const f of walk(join(process.cwd(), 'src/app')).concat(walk(join(process.cwd(), 'src/ui')))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /import |require\(|\.provider|provider ===/.test(line)) return; // comments + imports are not rendered
    const strings = line.match(/(['"`])((?:\\.|(?!\1).)*)\1|>[^<{]+</g) ?? [];
    if (strings.some((s) => banned.test(s))) offenders.push(`${f.split('src/')[1]}:${i + 1}`);
  });
}
ok(offenders.length === 0, 'no third-party brand/watermark text anywhere in screens or UI', offenders);

asyncPart.then(() => {
  console.log(`live-room.test: PASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
});
