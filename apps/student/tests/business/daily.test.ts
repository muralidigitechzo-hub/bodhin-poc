// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Daily Practice Arena: challenge-of-the-day pick, streak maths, and the API that records a daily solve. */
import * as api from '@/api/client';
import { db } from '@/api/mockDb';
import { CHALLENGES } from '@/playground/challenges';
import { addDays, dayKey, lastDays, pickDaily, streakOf } from '@/playground/daily';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

/* ── day helpers ── */
ok(dayKey(new Date(2026, 0, 5)) === '2026-01-05', 'dayKey is zero-padded local date');
ok(addDays('2026-01-01', -1) === '2025-12-31', 'addDays crosses a year');
ok(addDays('2026-03-01', -1) === '2026-02-28', 'addDays crosses a month');
ok(addDays('2026-03-29', 1) === '2026-03-30', 'addDays is DST-safe');

/* ── challenge of the day ── */
const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
ok(pickDaily(list, '2026-06-10')!.id === pickDaily(list, '2026-06-10')!.id, 'same day → same challenge');
const three = [0, 1, 2].map((i) => pickDaily(list, addDays('2026-06-10', i))!.id);
ok(new Set(three).size === 3, 'consecutive days rotate through the list', three);
ok(pickDaily(list, addDays('2026-06-10', 3))!.id === three[0], 'rotation wraps around');
ok(pickDaily([], '2026-06-10') === undefined, 'empty list → none');

/* ── streak ── */
const T = '2026-06-10';
let s = streakOf([], T);
ok(s.current === 0 && s.best === 0 && !s.doneToday && !s.atRisk, 'no history', s);
s = streakOf([T], T);
ok(s.current === 1 && s.doneToday && !s.atRisk, 'only today', s);
s = streakOf(['2026-06-08', '2026-06-09', T], T);
ok(s.current === 3 && s.best === 3, 'three in a row ending today', s);
s = streakOf(['2026-06-07', '2026-06-08', '2026-06-09'], T);
ok(s.current === 3 && !s.doneToday && s.atRisk, 'run ending yesterday stays alive but is at risk', s);
s = streakOf(['2026-06-06', '2026-06-07'], T);
ok(s.current === 0 && s.best === 2 && !s.atRisk, 'missed a full day → streak reset, best kept', s);
s = streakOf(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08', T], T);
ok(s.best === 4 && s.current === 1, 'best is the longest past run', s);
s = streakOf([T, T, '2026-06-09', '2026-06-09'], T);
ok(s.current === 2, 'duplicate days count once', s);
const w = lastDays(['2026-06-09', T], T, 7);
ok(w.length === 7 && w[6].today && w[6].done && w[5].done && !w[4].done && w[0].day === '2026-06-04', 'week dots', w.map((x) => x.day + (x.done ? '*' : '')));

/* ── API: solving today's daily challenge records the day (once) and builds the streak ── */
const U = 'u_daily_test';
const d0 = api.playground.daily(U);
ok(!d0.done && d0.streak.current === 0 && d0.challenge && d0.week.length === 7, 'fresh learner starts at 0', d0.streak);
ok(d0.challenge.id === pickDaily(api.dailyPool(), dayKey())!.id, 'API serves the date-picked challenge');

const other = CHALLENGES.find((c) => c.id !== d0.challenge.id)!;
ok(api.dailyPool().length > 5 && api.dailyPool().every((c) => !['go','java','c','cpp','csharp','rust','php','ruby','kotlin'].includes(c.stack)), 'daily pool is browser-runnable only', api.dailyPool().map((c) => c.stack));
api.playground.markSolved(U, other.id);
ok(!api.playground.daily(U).done, 'solving some other challenge does not count for the daily');

api.playground.markSolved(U, d0.challenge.id);
let d1 = api.playground.daily(U);
ok(d1.done && d1.streak.current === 1 && d1.streak.doneToday, 'solving today’s challenge → done, streak 1', d1.streak);
api.playground.markSolved(U, d0.challenge.id); // re-check must not double count
ok(db.playgroundDaily.filter((x) => x.userId === U).length === 1, 'recorded once per day');
ok(api.playground.overview(U).solved.length === 2, 'normal solved list is unaffected');

/* yesterday + the day before already done → streak becomes 3 today; daily() with a later "now" shows it at risk */
db.playgroundDaily.push({ userId: U, day: addDays(dayKey(), -1), challengeId: 'x' }, { userId: U, day: addDays(dayKey(), -2), challengeId: 'x' });
ok(api.playground.daily(U).streak.current === 3, 'earlier days extend the streak');
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
const dT = api.playground.daily(U, tomorrow);
ok(dT.streak.current === 3 && !dT.done && dT.streak.atRisk, 'next morning: streak alive, today not done, at risk', dT.streak);
ok(api.playground.daily('someone_else').streak.current === 0, 'streaks are per learner');

console.log(`daily: ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
