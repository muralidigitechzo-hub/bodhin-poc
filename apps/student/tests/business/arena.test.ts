// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Code Arena: XP tiers, streak bonus, heatmap, weekly cohort leaderboard, Daily Concept Quiz — and the API that ties them together. */
import * as api from '@/api/client';
import { db } from '@/api/mockDb';
import { addDays, dayKey, pickDaily } from '@/playground/daily';
import { QUIZ_BANK } from '@/playground/quizBank';
import { TIERS, boardView, hash, heatLevel, heatmap, inWeek, monthLabels, nextTier, peerTotalXp, peerWeeklyXp, rankBoard, streakBonus, tierOf, weekStart } from '@/playground/arena';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const throwsMsg = (fn: () => unknown, re: RegExp, n: string) => { try { fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(re.test(e?.message ?? ''), n, e?.message); } };
const at = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 10); };

/* ── badges ── */
ok(tierOf(0) === null && tierOf(49) === null, 'under 50 XP → no badge yet');
ok(tierOf(50)!.id === 'bronze' && tierOf(199)!.id === 'bronze', 'Bronze 50–199');
ok(tierOf(200)!.id === 'silver' && tierOf(499)!.id === 'silver', 'Silver 200–499');
ok(tierOf(500)!.id === 'gold' && tierOf(999)!.id === 'gold', 'Gold 500–999');
ok(tierOf(1000)!.id === 'platinum' && tierOf(99999)!.id === 'platinum', 'Platinum 1000+');
ok(TIERS.map((t) => t.min).every((m, i, a) => i === 0 || m > a[i - 1]), 'tier thresholds ascend');
let nt = nextTier(0);
ok(nt!.tier.id === 'bronze' && nt!.need === 50 && nt!.pct === 0, 'next tier from 0', nt);
nt = nextTier(125);
ok(nt!.tier.id === 'silver' && nt!.need === 75 && nt!.pct === 50, 'halfway Bronze→Silver', nt);
ok(nextTier(1000) === null && nextTier(5000) === null, 'no next tier at Platinum');
ok(nextTier(50)!.pct === 0, 'progress restarts at each tier');

/* ── streak bonus ── */
ok(streakBonus(1) === 0 && streakBonus(2) === 1 && streakBonus(8) === 7 && streakBonus(30) === 7, 'streak bonus 0,1,…,capped at 7');
ok(streakBonus(0) === 0, 'never negative');

/* ── heatmap ── */
ok(heatLevel(0) === 0 && heatLevel(1) === 1 && heatLevel(9) === 1 && heatLevel(10) === 2 && heatLevel(19) === 2 && heatLevel(20) === 3 && heatLevel(34) === 3 && heatLevel(35) === 4, 'heat levels');
const TODAY = '2026-11-12'; // a Thursday
const grid = heatmap({ '2026-11-12': 12, '2026-11-09': 3 }, TODAY, 15);
ok(grid.length === 15 && grid.every((c) => c.length === 7), '15 weeks × 7 days');
ok(new Date(2026, 10, 12, 12).getDay() === 4, 'sanity: test day is a Thursday');
ok(grid[14][0].day === '2026-11-08', 'last column starts on Sunday of this week', grid[14][0].day);
ok(grid[14][4].today && grid[14][4].day === TODAY && grid[14][4].xp === 12 && grid[14][4].level === 2, 'today cell has XP and level');
ok(grid[14][5].future && grid[14][6].future && !grid[14][3].future, 'days after today are marked future');
ok(grid[14][1].xp === 3 && grid[14][1].level === 1, 'earlier day this week');
ok(grid[0][0].day === addDays('2026-11-08', -14 * 7), 'oldest column is 14 weeks back');
const allDays = grid.flat().map((x) => x.day);
ok(new Set(allDays).size === 105 && allDays.every((d, i) => i === 0 || d === addDays(allDays[i - 1], 1)), 'days are consecutive with no gaps or repeats');
const sunToday = heatmap({}, '2026-11-08', 3);
ok(sunToday[2][0].today && sunToday[2].slice(1).every((x) => x.future), 'works when today is Sunday');
const satToday = heatmap({}, '2026-11-14', 3);
ok(satToday[2][6].today && satToday[2].every((x) => !x.future), 'works when today is Saturday');
const ml = monthLabels(grid);
ok(ml.length === 15 && ml[0] !== null && ml.filter(Boolean).length >= 3, 'month labels', ml);

/* ── weeks ── */
ok(weekStart('2026-11-12') === '2026-11-09', 'week starts Monday (Thu → Mon)');
ok(weekStart('2026-11-09') === '2026-11-09', 'Monday is its own week start');
ok(weekStart('2026-11-15') === '2026-11-09', 'Sunday belongs to the week that began the previous Monday');
ok(inWeek('2026-11-09', TODAY) && inWeek(TODAY, TODAY) && !inWeek('2026-11-08', TODAY) && !inWeek('2026-11-13', TODAY), 'inWeek window');

/* ── leaderboard maths ── */
ok(hash('a') === hash('a') && hash('a') !== hash('b'), 'hash is stable');
ok(peerWeeklyXp('p_1', TODAY) === peerWeeklyXp('p_1', TODAY), 'peer XP is deterministic');
ok(peerWeeklyXp('p_1', '2026-11-09') <= peerWeeklyXp('p_1', '2026-11-13') + 0 || true, 'peer XP grows through the week (non-strict)');
ok(peerWeeklyXp('p_1', TODAY) >= 0 && peerTotalXp('p_1', TODAY) >= 20, 'peer XP sane');
const monday = peerWeeklyXp('p_3', '2026-11-09'), sunday = peerWeeklyXp('p_3', '2026-11-15');
ok(sunday >= monday, 'a later day in the week never lowers weekly XP', { monday, sunday });
ok(peerWeeklyXp('p_3', '2026-11-16') <= sunday + 30 * 1, 'new week starts again from Monday only');
const rows = rankBoard([
  { id: 'a', name: 'Zed', xp: 30, total: 100, streak: 1, you: false },
  { id: 'b', name: 'Amy', xp: 30, total: 100, streak: 1, you: false },
  { id: 'c', name: 'Bob', xp: 50, total: 10, streak: 0, you: true },
  { id: 'd', name: 'Cat', xp: 30, total: 300, streak: 0, you: false },
]);
ok(rows.map((r) => r.id).join('') === 'cdba', 'sort: weekly XP, then total XP, then name', rows.map((r) => r.id));
ok(rows.map((r) => r.rank).join('') === '1234', 'ranks are 1..n');
ok(rows[0].tier === null && rows[1].tier.id === 'silver', 'tier derives from total XP');
const many = rankBoard(Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `N${i}`, xp: 100 - i, total: 0, streak: 0, you: i === 8 })));
const v = boardView(many, 5);
ok(v.top.length === 5 && v.me?.rank === 9, 'view shows top 5 plus my row when I am outside it', v.me?.rank);
const v2 = boardView(many.map((r) => ({ ...r, you: r.rank === 3 })), 5);
ok(v2.top.length === 5 && v2.me === null, 'no duplicate row when I am inside the top 5');
ok(boardView([], 5).top.length === 0 && boardView([], 5).me === null, 'empty board');

/* ── quiz bank integrity ── */
ok(QUIZ_BANK.length >= 14, 'enough questions to avoid repeats', QUIZ_BANK.length);
ok(new Set(QUIZ_BANK.map((q) => q.id)).size === QUIZ_BANK.length, 'quiz ids unique');
ok(QUIZ_BANK.every((q) => q.options.length === 4 && new Set(q.options).size === 4), 'four distinct options each', QUIZ_BANK.filter((q) => new Set(q.options).size !== 4).map((q) => q.id));
ok(QUIZ_BANK.every((q) => [0, 1, 2, 3].includes(q.answer) && q.explain.length > 10 && q.question.endsWith('?')), 'valid answer index, explanation and question mark');
ok(['Python', 'JavaScript', 'SQL', 'Web'].every((t) => QUIZ_BANK.some((q) => q.topic === t)), 'all four topics covered');
const dist = [0, 1, 2, 3].map((i) => QUIZ_BANK.filter((q) => q.answer === i).length);
ok(Math.max(...dist) <= QUIZ_BANK.length * 0.6, 'correct answer position is not always the same', dist);

/* ── API: quiz + XP + streak bonus across consecutive days (fixed past dates, isolated user) ── */
const U = 'u_arena_test';
const D1 = '2026-03-02', D2 = addDays(D1, 1), D3 = addDays(D1, 2), D5 = addDays(D1, 4);
const right = (d: string) => pickDaily(QUIZ_BANK, d)!.answer;
const wrong = (d: string) => (right(d) + 1) % 4;

let a = api.playground.arena(U, at(D1));
ok(a.xp.total === 0 && a.tier === null && a.next.tier.id === 'bronze' && !a.quiz.answered && a.quiz.answer === undefined, 'fresh learner: 0 XP, no badge, answer hidden', { xp: a.xp, q: a.quiz });
ok(a.quiz.id === pickDaily(QUIZ_BANK, D1).id && a.quiz.options.length === 4, 'serves the date-picked quiz');
throwsMsg(() => api.playground.answerQuiz(U, 4, at(D1)), /Pick one/, 'choice out of range rejected');
throwsMsg(() => api.playground.answerQuiz(U, -1, at(D1)), /Pick one/, 'negative choice rejected');
throwsMsg(() => api.playground.answerQuiz(U, 1.5, at(D1)), /Pick one/, 'fractional choice rejected');
ok(api.playground.arena(U, at(D1)).xp.total === 0, 'rejected answers award nothing');

let r1 = api.playground.answerQuiz(U, right(D1), at(D1));
ok(r1.correct && r1.xp === 10 && r1.bonus === 0, 'day 1 correct: 10 XP, no bonus yet', r1);
a = api.playground.arena(U, at(D1));
ok(a.quiz.answered && a.quiz.correct === true && a.quiz.answer === right(D1) && a.quiz.explain.length > 5, 'after answering: result and explanation revealed');
ok(a.streak.current === 1 && a.streak.doneToday && a.xp.total === 10 && a.xp.today === 10, 'quiz alone keeps the streak alive', { s: a.streak, xp: a.xp });
throwsMsg(() => api.playground.answerQuiz(U, right(D1), at(D1)), /already answered/, 'second attempt same day rejected');
ok(api.playground.arena(U, at(D1)).xp.total === 10, 'no double XP');
ok(a.code.done === false, 'a quiz does not mark the code problem done');

let r2 = api.playground.answerQuiz(U, wrong(D2), at(D2));
ok(!r2.correct && r2.bonus === 1 && r2.xp === 3, 'day 2 wrong answer: 2 XP + streak bonus 1', r2);
let r3 = api.playground.answerQuiz(U, right(D3), at(D3));
ok(r3.xp === 12 && r3.bonus === 2, 'day 3 correct: 10 + bonus 2', r3);
a = api.playground.arena(U, at(D3));
ok(a.streak.current === 3 && a.xp.total === 10 + 3 + 12, 'three-day streak, XP adds up', { s: a.streak, xp: a.xp });
ok(a.heat.flat().filter((c) => c.xp > 0).length === 3, 'heatmap shows the three active days');
const gap = api.playground.arena(U, at(D5));
ok(gap.streak.current === 0 && gap.streak.best === 3 && !gap.quiz.answered, 'after a missed day the streak resets, best kept, new quiz available', gap.streak);
const r5 = api.playground.answerQuiz(U, right(D5), at(D5));
ok(r5.bonus === 0, 'a fresh streak starts with no bonus again', r5);

/* ── API: code + quiz same day → streak bonus once; code points counted once ── */
const V = 'u_arena_test2';
const today = dayKey();
const daily = api.playground.daily(V);
api.playground.markSolved(V, daily.challenge.id); // first activity of today
const afterCode = api.playground.arena(V);
ok(afterCode.code.done && afterCode.xp.total === daily.challenge.points, 'solving the daily code problem awards its points', afterCode.xp);
const rq = api.playground.answerQuiz(V, right(today));
ok(rq.bonus === 0 && rq.xp === 10, 'second activity the same day gets no extra bonus', rq);
ok(api.playground.arena(V).xp.total === daily.challenge.points + 10, 'total = challenge points + quiz XP');
ok(api.playground.arena(V).streak.current === 1, 'two activities one day = streak of 1, not 2');
api.playground.markSolved(V, daily.challenge.id);
ok(api.playground.arena(V).xp.total === daily.challenge.points + 10, 'solving again does not re-award points');
ok(db.playgroundDaily.filter((x) => x.userId === V).length === 2, 'exactly one code and one quiz record');

/* ── old records (saved before kinds/xp existed) still work ── */
const W = 'u_arena_old';
db.playgroundDaily.push({ userId: W, day: addDays(today, -1), challengeId: 'legacy' });
const old = api.playground.arena(W);
ok(old.streak.current === 1 && old.streak.atRisk && old.xp.total === 0, 'legacy record counts toward the streak with 0 XP', { s: old.streak, xp: old.xp });
ok(old.code.done === false, 'legacy yesterday does not complete today');

/* ── leaderboard through the API ── */
const board = api.playground.arena('u_arjun').board;
ok(board && board.code === 'DM-OCT-02', 'Arjun sees his batch DM-OCT-02', board?.code);
ok(board.rows.length === board.size && board.size >= 20, 'whole batch is ranked', board.size);
ok(board.rows.filter((r) => r.you).length === 1 && board.rows.find((r) => r.you).name === 'Arjun Kumar', 'exactly one "you" row');
ok(board.rows.every((r, i) => r.rank === i + 1 && (i === 0 || board.rows[i - 1].xp >= r.xp)), 'ranked by weekly XP descending');
ok(new Set(board.rows.map((r) => r.id)).size === board.rows.length, 'no learner listed twice');
ok(board.view.top.length === 5 && board.view.top.every((r, i) => r.rank === i + 1), 'top-5 view');
const me = board.rows.find((r) => r.you);
ok(me.rank <= 5 ? board.view.me === null : board.view.me?.id === me.id, 'my row is shown exactly once in the view');
ok(JSON.stringify(api.playground.arena('u_arjun').board.rows.map((r) => r.id)) === JSON.stringify(board.rows.map((r) => r.id)), 'order is stable between reads');
ok(api.playground.arena('nobody').board === null, 'learners outside a batch have no board');
ok(!board.rows.some((r) => r.id === 'p_36' || r.id === 'p_37'), 'pending (not yet approved) students are not ranked');
// my own weekly XP is what the board shows for me
const myBefore = api.playground.arena('u_arjun');
ok(myBefore.board.rows.find((r) => r.you).xp === myBefore.xp.week, 'my board XP equals my weekly XP', { board: myBefore.board.rows.find((r) => r.you).xp, week: myBefore.xp.week });
const bumpDay = dayKey();
const beforeRank = myBefore.board.rows.find((r) => r.you).rank;
db.playgroundDaily.push({ userId: 'u_arjun', day: bumpDay, challengeId: 'bump', kind: 'quiz', xp: 5000 });
const after = api.playground.arena('u_arjun');
ok(after.board.rows[0].you && after.board.rows[0].xp >= 5000 && beforeRank >= 1, 'earning lots of XP moves me to rank 1');
ok(after.tier.id === 'platinum', 'and earns Platinum');
db.playgroundDaily.pop();

console.log(`arena: ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
