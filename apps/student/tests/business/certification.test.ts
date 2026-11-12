// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Certification: 75% of lessons + every course quiz passed → request goes to the course creator (tutor or Admin)
   → approval issues the certificate the learner downloads. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';
import { ASSESSMENTS } from '@/api/assessSeed';
import { eligibility, certificateHtml, CERT_MIN_PROGRESS } from '@/core/certification';
import { allLessons } from '@/core/catalog';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn: () => unknown, n: string, m?: RegExp) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }

/* ── pure rule ── */
ok(CERT_MIN_PROGRESS === 75, 'bar is 75%');
ok(!eligibility(74, []).eligible, '74% is not enough');
ok(eligibility(75, []).eligible, '75% with no quiz is enough');
ok(!eligibility(100, [{ id: 'q', title: 'Q', passPct: 60, best: null }]).eligible, 'quiz never taken blocks');
ok(!eligibility(100, [{ id: 'q', title: 'Q', passPct: 60, best: 59 }]).eligible, 'quiz below the pass mark blocks');
ok(eligibility(75, [{ id: 'q', title: 'Q', passPct: 60, best: 60 }]).eligible, 'pass mark met');
ok(eligibility(40, [{ id: 'q', title: 'Q', passPct: 60, best: 10 }]).missing.length === 2, 'tells the learner both things that are missing');
ok(/<script|<b>x/.test(certificateHtml({ id: 'X', title: 'T', program: 'P', issuedAt: new Date().toISOString(), tutor: 'T' }, '<b>x</b>', 'u')) === false, 'certificate file escapes names');

const learn = (u: string, courseId: string, n: number) => {
  const c = seedCourses.find((x) => x.id === courseId)!;
  allLessons(c).slice(0, n).forEach((l) => api.player.setComplete(u, courseId, l.id, true));
};
const passQuizzes = async (u: string, courseId: string) => {
  for (const a of ASSESSMENTS.filter((x) => x.courseId === courseId && x.kind !== 'assignment' && x.status !== 'draft' && !x.batchId)) {
    const s = api.assessments.start(u, a.id);
    await api.assessments.submit(u, a.id, s.questions.map((q) => q.correct), Date.now() - 60000);
  }
};
const enrol = (u: string, courseId: string) => db.enrollments.push({ userId: u, courseId, enrolledAt: new Date().toISOString(), completedLessonIds: [], source: 'direct' });

async function main() {
  db.certRequests = [];
  const U = 'u_meera'; // a learner here; also a tutor elsewhere, which must not matter
  db.enrollments = db.enrollments.filter((e) => e.userId !== U);
  db.certificates = db.certificates.filter((c) => c.userId !== U);

  /* ── tutor-made course ── */
  const needQ = (c) => ASSESSMENTS.filter((a) => a.courseId === c.id && a.kind !== 'assignment' && a.status !== 'draft' && !a.batchId);
  const isOpen = (c) => needQ(c).every((a) => !a.opensAt || new Date(a.opensAt).getTime() < Date.now());
  const tc = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.certificate && needQ(c).length && isOpen(c));
  ok(!!tc, 'there is a tutor course with a quiz to test');
  const tcLessons = allLessons(tc).length;
  const need = Math.ceil(tcLessons * 0.75);
  enrol(U, tc.id);
  await passQuizzes(U, tc.id); // passing a curriculum quiz also completes its lesson
  const ids = allLessons(tc).map((l) => l.id);
  const enr = db.enrollments.find((e) => e.userId === U && e.courseId === tc.id);
  enr.completedLessonIds = ids.slice(0, need - 1); // exactly one lesson short of 75%
  api.certification.evaluate(U, tc.id);
  ok(db.certRequests.length === 0, 'just under 75% with quizzes passed → no request', { need, tcLessons });
  const before = (await Promise.resolve(api.certification.mine(U))).inProgress.find((x) => x.course.id === tc.id);
  ok(before && !before.st.eligible && before.st.missing.length === 1, 'learner is shown what is missing', before?.st.missing);
  learn(U, tc.id, need);
  ok(db.certRequests.length === 1 && db.certRequests[0].status === 'pending', 'reaching 75% with quizzes passed raises exactly one pending request');
  const creq = db.certRequests[0];
  ok(creq.tenantId === 't_rajesh', 'request belongs to the tutor workspace');
  learn(U, tc.id, tcLessons);
  api.certification.sync(U);
  ok(db.certRequests.length === 1, 'more progress or a sync never raises a second request');
  ok(api.certificates.list(U).length === 0, 'no certificate is issued before approval (not even at 100%)');
  ok(db.notifications.some((n) => n.userId === 'u_rajesh' && /certificate approval/i.test(n.title) && n.link?.pathname === '/edu/certificates'), 'workspace owner is notified in the tutor portal');
  ok(db.notifications.some((n) => n.userId === U && /certificate requested/i.test(n.title)), 'learner is told the request is waiting');

  const q1 = api.certification.queue('u_rajesh', 'educator');
  ok(q1.pending.some((x) => x.r.id === creq.id && x.student), 'owner sees it in the tutor queue');
  ok(!api.certification.queue('u_meera', 'educator').pending.some((x) => x.r.id === creq.id), 'a tutor not assigned to the course does not see it');
  await throws(() => api.certification.queue('u_rajesh', 'admin'), 'tutor cannot open the admin queue', /admin/i);
  ok(api.certification.pendingCount('u_admin', 'admin') === 0, 'the admin queue is empty: not their course');
  await throws(() => api.certification.decide('u_admin', 'educator', creq.id, 'approve'), 'admin cannot approve a tutor course through the tutor route', /educators|queue|admin/i);
  await throws(() => api.certification.decide('u_rajesh', 'educator', creq.id, 'reject', '  '), 'declining needs a note', /fix|tell/i);

  await api.certification.decide('u_rajesh', 'educator', creq.id, 'reject', 'Please redo the final project');
  ok(db.certRequests[0].status === 'rejected' && api.certificates.list(U).length === 0, 'declined: still no certificate');
  ok(db.notifications.some((n) => n.userId === U && /not approved/i.test(n.title) && /final project/.test(n.body)), 'learner sees the reason');
  await throws(() => api.certification.decide('u_rajesh', 'educator', creq.id, 'approve'), 'a decided request cannot be decided again', /already/i);
  api.certification.evaluate(U, tc.id);
  ok(db.certRequests.length === 1, 'a decline is not re-raised automatically');
  api.certification.reRequest(U, creq.id);
  const again = db.certRequests.find((r) => r.userId === U && r.courseId === tc.id);
  ok(db.certRequests.length === 1 && again.status === 'pending', 'learner can request again, still one request');
  await throws(() => api.certification.reRequest(U, again.id), 'cannot re-request something already pending', /waiting/i);
  await throws(() => api.certification.reRequest('u_arjun', again.id), 'cannot re-request someone else’s', /not found/i);

  // progress dropped after asking → approval blocked, honestly
  api.player.setComplete(U, tc.id, allLessons(tc)[0].id, false);
  allLessons(tc).slice(0, tcLessons - need + 1).forEach((l) => api.player.setComplete(U, tc.id, l.id, false));
  const blocked = api.certification.queue('u_rajesh', 'educator').pending.find((x) => x.r.id === again.id);
  ok(blocked && blocked.eligible === false, 'queue flags a learner who no longer qualifies');
  await throws(() => api.certification.decide('u_rajesh', 'educator', again.id, 'approve'), 'approval refused when learner no longer qualifies', /no longer qualifies/i);
  learn(U, tc.id, tcLessons);

  await api.certification.decide('u_rajesh', 'educator', again.id, 'approve', 'Well done');
  const issued = api.certificates.list(U);
  ok(issued.length === 1 && issued[0].courseId === tc.id, 'approval issues the certificate to the learner');
  ok(api.certificates.get(U, issued[0].id), 'the learner can open it');
  ok((await api.certificates.verify(issued[0].id)).valid, 'it verifies publicly');
  ok(db.certRequests.find((r) => r.id === again.id).certId === issued[0].id, 'request is linked to the certificate');
  ok(api.certification.mine(U).requests.length === 0, 'approved requests leave the learner’s waiting list');
  api.certification.evaluate(U, tc.id); api.certification.sync(U);
  ok(db.certRequests.length === 1 && api.certificates.list(U).length === 1, 'no new request after the certificate exists');
  ok(db.notifications.some((n) => n.userId === U && /certificate approved/i.test(n.title) && n.link?.pathname === '/certificates'), 'learner told it is ready');

  /* ── Bodhin-made course → Admin portal ── */
  const bc = seedCourses.find((c) => c.tenantId === 't_bodhin' && c.certificate);
  enrol(U, bc.id);
  learn(U, bc.id, Math.ceil(allLessons(bc).length * 0.75));
  await passQuizzes(U, bc.id);
  const breq = db.certRequests.find((r) => r.courseId === bc.id);
  ok(breq && breq.status === 'pending', 'Bodhin course request raised');
  ok(db.notifications.some((n) => n.userId === 'u_admin' && /certificate approval/i.test(n.title) && n.link?.pathname === '/admin/certificates'), 'admin is notified in the admin portal');
  ok(!db.notifications.some((n) => n.userId === 'u_rajesh' && /certificate approval/i.test(n.title) && n.body.includes(bc.title)), 'the tutor is not asked about Bodhin’s course');
  ok(api.certification.queue('u_admin', 'admin').pending.some((x) => x.r.id === breq.id), 'admin queue shows it');
  ok(!api.certification.queue('u_rajesh', 'educator').pending.some((x) => x.r.id === breq.id), 'tutor queue does not');
  ok(api.certification.pendingCount('u_admin', 'admin') >= 1, 'admin pending count');
  await throws(() => api.certification.decide('u_rajesh', 'admin', breq.id, 'approve'), 'tutor cannot approve a Bodhin course', /allow|forbidden/i);
  const aBefore = db.audit.length;
  await api.certification.decide('u_admin', 'admin', breq.id, 'approve');
  ok(api.certificates.list(U).some((c) => c.courseId === bc.id), 'admin approval issues the certificate');
  ok(db.audit.length === aBefore + 1 && db.audit[0].action === 'certificate.approve', 'admin decision is audited');
  ok(new Set(api.certificates.list(U).map((c) => c.id)).size === api.certificates.list(U).length, 'certificate ids are unique');

  /* ── guards ── */
  const nq = seedCourses.find((c) => c.tenantId === 't_rajesh' && !c.certificate);
  if (nq) { enrol('u_arjun', nq.id); learn('u_arjun', nq.id, allLessons(nq).length); ok(!db.certRequests.some((r) => r.userId === 'u_arjun' && r.courseId === nq.id), 'a course without certificates never raises a request'); }
  ok(!db.certRequests.some((r) => r.userId === 'u_arjun' && db.certificates.some((c) => c.userId === 'u_arjun' && c.courseId === r.courseId)), 'courses Arjun already holds a certificate for are not re-requested');
  api.certification.evaluate('u_nobody', tc.id);
  ok(!db.certRequests.some((r) => r.userId === 'u_nobody'), 'a user who did not buy the course gets nothing');

  console.log(`certification: ${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
