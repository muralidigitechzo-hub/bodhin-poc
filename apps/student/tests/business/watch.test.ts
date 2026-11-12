/* Video drop-off: what counts as watching, the analysis (curve, where viewers leave, problem moments), and who may see it. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';
import { allLessons } from '@/core/catalog';
import { MIN_VIEWERS, analyseWatch, bucketCount, mergeBuckets, mmss, watchedBuckets } from '@/core/watch';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/* ── what counts as watching ── */
ok(JSON.stringify(watchedBuckets(0, 3, 6)) === '[0]', 'a small forward step inside the first 10 seconds is piece 0');
ok(JSON.stringify(watchedBuckets(9, 11, 6)) === '[0,1]', 'a step across a boundary covers both pieces');
ok(watchedBuckets(5, 60, 6).length === 0, 'a jump ahead (seeking) is not watching');
ok(watchedBuckets(60, 30, 6).length === 0 && watchedBuckets(20, 20, 6).length === 0, 'going back or standing still is not watching');
ok(JSON.stringify(mergeBuckets([3, 1], [2, 2, 99, -1], 10)) === '[1,2,3]', 'merging keeps pieces sorted, unique and inside the video');
ok(bucketCount(600) === 60 && bucketCount(601) === 61 && bucketCount(0) === 1, 'a 10-minute video has 60 pieces');
ok(mmss(270) === '4:30' && mmss(65) === '1:05', 'times read as m:ss');

/* ── the analysis ── */
const D = 600; // 10-minute lesson → 60 pieces → 20 windows of 30 s
const full = range(0, 60);
const left = (atBucket: number) => range(0, atBucket); // watched 0..atBucket-1 then left
ok(analyseWatch(D, [full, full, full, left(10)]).status === 'not_enough' && analyseWatch(D, []).viewers === 0, `fewer than ${MIN_VIEWERS} viewers → nothing is shown`);
ok(analyseWatch(D, [full, full, full, full, [] as number[]]).status === 'not_enough', 'someone who never watched a piece is not a viewer');
const a = analyseWatch(D, [full, full, full, full, full, full, left(30), left(30), left(30), left(30)]);
ok(a.status === 'ok' && a.viewers === 10, 'ten viewers are analysed', a);
ok(a.finishPct === 60 && a.avgWatchedPct === 80, '6 of 10 finished; on average 80% was watched', [a.finishPct, a.avgWatchedPct]);
ok(a.curve[0] === 100 && a.curve[29] === 100 && a.curve[30] === 60 && a.curve[59] === 60, 'the curve drops from 100% to 60% at 5:00');
ok(a.heat[9] === 40 && a.heat.filter((x) => x > 0).length === 1, 'the 4 who stopped after 5:00 all left in the 4:30–5:00 window', a.heat);
ok(a.moments.length === 1 && a.moments[0].label === '4:30–5:00' && a.moments[0].pct === 40 && a.moments[0].count === 4, 'one problem moment: 40% left at 4:30–5:00', a.moments);
const one = analyseWatch(D, [full, full, full, full, full, full, full, full, full, left(30)]);
ok(one.moments.length === 0 && one.heat[9] === 10, 'a single person leaving is not a "problem moment"', one.moments);
const many = analyseWatch(D, [...Array(4).fill(left(6)), ...Array(3).fill(left(21)), ...Array(2).fill(left(45)), ...Array(2).fill(left(12)), full, full]);
ok(many.moments.length === 3 && many.moments[0].pct >= many.moments[1].pct && many.moments[1].pct >= many.moments[2].pct, 'at most three problem moments, worst first', many.moments);
ok(many.moments[0].label === '0:30–1:00', 'the biggest early drop is found', many.moments[0]);
const skipper = analyseWatch(D, [[0, 1, 2, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], full, full, full, full]);
ok(skipper.status === 'ok' && skipper.curve[10] === 80 && skipper.curve[40] === 100, 'a skipped section shows as a dip in the curve (not as people leaving)', [skipper.curve[10], skipper.curve[40]]);
ok(analyseWatch(5, [[0], [0], [0], [0], [0]]).curve.length === 1, 'a very short video still works');

/* ── real watching and who sees it ── */
async function main() {
  const course = seedCourses.find((c) => c.id === 'c_dm_ai')!;
  const lesson = allLessons(course).find((l) => l.type === 'video')!;
  const dur = lesson.durationSec ?? 600;
  const watchFrom = (uid: string, until: number) => { for (let t = 0; t < until; t += 3) api.player.recordWatch(uid, course.id, lesson.id, t, t + 3, 3.5); };

  const before = api.insights.lesson('u_rajesh', course.id, lesson.id)!;
  ok(before.analysis.status === 'not_enough', 'a fresh lesson has no drop-off yet (no invented data)', before.analysis);

  watchFrom('u_arjun', 120);
  ok((db.watch?.[lesson.id]?.u_arjun ?? []).length > 0, 'an enrolled learner’s watching is recorded');
  const rec = (db.watch![lesson.id].u_arjun).length;
  api.player.recordWatch('u_arjun', course.id, lesson.id, 10, 200, 3.5);
  ok(db.watch![lesson.id].u_arjun.length === rec, 'seeking ahead adds nothing');
  api.player.recordWatch('u_nobody', course.id, lesson.id, 0, 3, 3.5);
  ok(!db.watch![lesson.id].u_nobody, 'someone who is not enrolled is not recorded');
  const pdf = allLessons(course).find((l) => l.type !== 'video');
  if (pdf) { api.player.recordWatch('u_arjun', course.id, pdf.id, 0, 3, 3.5); ok(!db.watch?.[pdf.id], 'a non-video lesson is never recorded'); }

  // five more enrolled learners: three leave 1/3 of the way in, two finish
  const src = db.enrollments.find((e) => e.userId === 'u_arjun' && e.courseId === course.id)!;
  const cut = Math.floor((dur / 3 / 30)) * 30; // start of a 30 s window
  for (let i = 0; i < 5; i++) { const uid = `u_viewer${i}`; if (!db.enrollments.some((e) => e.userId === uid && e.courseId === course.id)) db.enrollments.push({ ...src, userId: uid }); watchFrom(uid, i < 3 ? cut + 5 : dur); }
  const owner = api.insights.lesson('u_rajesh', course.id, lesson.id)!;
  ok(owner.analysis.status === 'ok' && owner.analysis.viewers === 6, 'with 6 viewers the analysis appears', owner.analysis.viewers);
  ok(owner.analysis.moments.length >= 1 && owner.analysis.moments[0].count >= 3, 'the three who left together form a problem moment', owner.analysis.moments);
  ok(owner.analysis.finishPct === 33, 'two of six finished', owner.analysis.finishPct);

  const overview = api.insights.course('u_rajesh', course.id)!;
  ok(overview.rows.every((r) => r.lesson.type === 'video') && overview.rows.length > 0, 'the course overview lists video lessons only');
  ok(overview.worstLessonId === lesson.id && overview.withData >= 1, 'the overview points at the lesson with the worst drop-off');

  /* who may look */
  const assigned = new Set(db.tutorAssignments.filter((x) => x.userId === 'u_meera').map((x) => x.courseId));
  const notMine = seedCourses.find((c) => c.tenantId === 't_rajesh' && !assigned.has(c.id) && allLessons(c).some((l) => l.type === 'video'));
  if (notMine) ok(api.insights.course('u_meera', notMine.id) === null && api.insights.lesson('u_meera', notMine.id, allLessons(notMine).find((l) => l.type === 'video')!.id) === null, 'a tutor cannot see courses that are not assigned to them');
  if (assigned.has(course.id)) ok(api.insights.lesson('u_meera', course.id, lesson.id) !== null, 'a tutor sees an assigned course');
  const otherOwner = db.memberships.find((m) => m.role === 'owner' && m.tenantId !== 't_rajesh' && m.tenantId !== 't_bodhin');
  if (otherOwner) ok(api.insights.lesson(otherOwner.userId, course.id, lesson.id) === null, 'another workspace cannot see Rajesh’s course insights');
  ok(api.insights.lesson('u_arjun', course.id, lesson.id) === null, 'a learner cannot open tutor insights');
  ok(api.insights.lesson('u_rajesh', course.id, 'no_such_lesson') === null, 'an unknown lesson gives nothing');

  console.log(`watch.test: PASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
