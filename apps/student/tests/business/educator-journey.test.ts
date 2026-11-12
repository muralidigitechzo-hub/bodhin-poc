/* Educator journey end to end: sign up → apply → approve → instructor profile → build course → publish rules
   → moderation → marketplace → sale → earnings → coupons/team gates → course edit protections. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses, tutors as seedTutors } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn: () => unknown, n: string, m?: RegExp) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
async function noThrow<T>(fn: () => T | Promise<T>, n: string): Promise<T | undefined> { try { return await fn(); } catch (e: any) { ok(false, n, e?.message); return undefined; } }

async function main() {
  /* ── 1. Sign-up creates only a draft (nothing for admin to review yet) ── */
  const s = await api.auth.signUp({ name: 'Udhay Test', email: 'udhay.e2e@test.in', phone: '9876011111', password: 'demo1234', role: 'tutor' });
  await api.auth.verifySignupOtp(s.userId, '123456');
  const inbox0 = await api.approvals.inbox('u_admin');
  ok(!inbox0.educators.some((x) => x.a.userId === s.userId), 'draft application is not in admin inbox');
  ok(api.auth.getApplication(s.userId)?.status === 'draft', 'application is draft after OTP');
  await throws(() => api.auth.submitApplication(s.userId, { workspaceName: 'Ab', subjects: ['Maths'], experienceYears: 3, city: 'Madurai', plannedStudents: 50 }), 'academy name validated', /name/i);
  await throws(() => api.auth.submitApplication(s.userId, { workspaceName: 'Udhay Maths Academy', subjects: [' '], experienceYears: 3, city: 'Madurai', plannedStudents: 50 }), 'subjects required', /subject/i);
  await throws(() => api.auth.submitApplication(s.userId, { workspaceName: 'Udhay Maths Academy', subjects: ['Maths'], experienceYears: 3, city: 'Madurai', plannedStudents: 50, sampleUrl: 'not a link' }), 'sample link validated', /link/i);
  await noThrow(() => api.auth.submitApplication(s.userId, { workspaceName: 'Udhay Maths Academy', subjects: ['Maths', 'Physics'], experienceYears: 6, city: 'Madurai', plannedStudents: 120, sampleUrl: 'https://youtube.com/@udhay', idVerified: true }), 'submit application');
  const inbox1 = await api.approvals.inbox('u_admin');
  const row = inbox1.educators.find((x) => x.a.userId === s.userId);
  ok(row && row.ready, 'submitted application appears in admin inbox and passes checks', row && api.approvals.appChecks(row.a));
  await throws(() => api.auth.submitApplication(s.userId, { workspaceName: 'Again', subjects: ['x'], experienceYears: 1, city: 'x', plannedStudents: 1 }), 'cannot resubmit while under review', /already submitted|No application/i);

  /* ── 2. Changes requested → tutor edits & resubmits ── */
  await noThrow(() => api.approvals.decideEducator('u_mod', row!.a.id, 'changes_requested', 'Please add your physics sample video'), 'moderator requests changes');
  ok(api.auth.getApplication(s.userId)?.status === 'changes_requested', 'status changes_requested');
  ok(db.notifications.some((n) => n.userId === s.userId && /update your educator application/i.test(n.title)), 'tutor notified about changes');
  await noThrow(() => api.auth.submitApplication(s.userId, { workspaceName: 'Udhay Maths Academy', subjects: ['Maths', 'Physics'], experienceYears: 6, city: 'Madurai', plannedStudents: 120, sampleUrl: 'https://youtube.com/@udhay/physics' }), 'resubmit after changes');
  ok(api.auth.getApplication(s.userId)?.status === 'submitted' && !api.auth.getApplication(s.userId)?.note, 'resubmitted, old note cleared');

  /* ── 3. Approve → workspace, trial, instructor profile ── */
  const res = await noThrow(() => api.approvals.approveEducator('u_mod', row!.a.id), 'approve') as any;
  const tid = res?.tenantId ?? db.tenants.find((t) => t.ownerUserId === s.userId)?.id;
  const t = db.tenants.find((x) => x.id === tid)!;
  ok(t?.subscription?.plan === 'growth' && t.subscription.status === 'trialing', '14-day Growth trial');
  const prof = seedTutors.find((x) => x.tenantId === tid);
  ok(prof && prof.name === 'Udhay Test' && /Maths/.test(prof.headline), 'own instructor profile created', prof);
  const ctx = api.educator.context(s.userId);
  ok(ctx?.role === 'owner' && ctx.tenant.id === tid, 'educator context = owner of new workspace');

  /* ── 4. Build the first course ── */
  const cid = api.courseAdmin.create(s.userId);
  const c0 = seedCourses.find((x) => x.id === cid)!;
  ok(c0.tutorId === prof?.id, 'new course belongs to the new instructor (not a demo tutor)', [c0.tutorId, prof?.id]);
  api.courseAdmin.update(s.userId, cid, { title: 'Class 10 Maths Crash Course', subtitle: 'Board exam prep in 30 days', description: 'A focused crash course covering every chapter of the class 10 maths syllabus with solved board papers.', categoryId: seedCourses[0].categoryId, outcomes: ['Solve algebra fast', 'Master geometry proofs', 'Score 90+ in boards'], priceInr: 1999 });
  // protected fields are ignored
  api.courseAdmin.update(s.userId, cid, { moderation: 'approved', rating: 5, ratingCount: 999, students: 5000, status: 'published' } as any);
  const c1 = seedCourses.find((x) => x.id === cid)!;
  ok(c1.rating === 0 && c1.students === 0 && c1.ratingCount === 0, 'educator cannot fake rating/students');
  ok(c1.status === 'draft', 'educator cannot publish by editing status (must pass checklist)');
  await throws(() => api.courseAdmin.publish(s.userId, cid), 'publish blocked without content', /content/i);
  const m = c1.modules[0];
  api.courseAdmin.saveLesson(s.userId, cid, m.id, { title: 'Welcome & syllabus', type: 'video', durationSec: 420, preview: true });
  // private paid course: needs own gateway
  await throws(() => api.courseAdmin.publish(s.userId, cid), 'private paid course needs gateway', /payments/i);
  // marketplace listing: a verified payout bank is enough
  api.courseAdmin.update(s.userId, cid, { visibility: 'public' });
  await throws(() => api.courseAdmin.publish(s.userId, cid), 'public paid course needs bank or gateway', /payments/i);
  await noThrow(() => api.paymentsSetup.saveBank(s.userId, { holder: 'Udhay Test', account: '123456789012', confirm: '123456789012', ifsc: 'HDFC0001234' }), 'save payout bank');
  await throws(() => api.courseAdmin.publish(s.userId, cid), 'listing needs 3 lessons (same bar as Bodhin review)', /3 lessons/i);
  api.courseAdmin.saveLesson(s.userId, cid, m.id, { title: 'Algebra in 20 minutes', type: 'video', durationSec: 1200 });
  api.courseAdmin.saveLesson(s.userId, cid, m.id, { title: 'Geometry proofs made easy', type: 'video', durationSec: 1500 });
  const pub = await noThrow(() => api.courseAdmin.publish(s.userId, cid), 'publish marketplace course with bank only') as any;
  ok(pub?.course.status === 'published' && pub.course.moderation === 'pending', 'published → sent to Bodhin review');

  /* ── 5. Moderation → marketplace ── */
  const explore = (ids: { id: string }[]) => ids.some((x) => x.id === cid);
  const ex0: any = await api.catalog.explore(null);
  ok(!JSON.stringify(ex0).includes(cid), 'pending course not on marketplace');
  const inboxC = await api.approvals.inbox('u_mod');
  ok(inboxC.courses.some((x) => x.c.id === cid), 'course in moderator inbox');
  await throws(() => api.approvals.decideCourse('u_fin', cid, 'approve'), 'finance cannot approve course');
  await noThrow(() => api.approvals.decideCourse('u_mod', cid, 'approve'), 'moderator approves course');
  const ex1: any = await api.catalog.explore(null);
  ok(JSON.stringify(ex1).includes(cid), 'approved course on marketplace');
  ok(db.notifications.some((n) => n.userId === s.userId && /live on the Bodhin marketplace/.test(n.title)), 'owner told course is live');
  // material edit (price) sends it back to review
  api.courseAdmin.update(s.userId, cid, { priceInr: 2499 });
  ok(seedCourses.find((x) => x.id === cid)!.moderation === 'pending', 'price change on listed course → back to review');
  await api.approvals.decideCourse('u_mod', cid, 'approve');
  void explore;

  /* ── 6. Learner buys on marketplace → owner sees sale, earnings ── */
  const before = db.usage[tid].activeStudents;
  const o = await noThrow(() => api.commerce.pay({ userId: 'u_arjun', courseId: cid, method: 'upi', source: 'bodhin_referral', checkoutTenantId: null } as any), 'learner buys new course') as any;
  ok(o?.channel === 'bodhin_marketplace' && o.educatorShareInr === 2499 - Math.round(2499 * 0.2) - Math.round(2499 * 0.02), 'marketplace split on new course', o && { share: o.educatorShareInr });
  ok(db.usage[tid].activeStudents === before + 1, 'active students +1');
  ok(db.notifications.some((n) => n.userId === s.userId && /New enrolment/.test(n.title)), 'owner notified of sale');
  const st: any = await api.earningsApi.statement(s.userId, 'month', 'all');
  ok(st.summary.net === o?.educatorShareInr, 'earnings statement shows the sale', st.summary);
  // direct sale blocked until gateway connected
  await throws(() => api.commerce.pay({ userId: 'u_meera', courseId: cid, method: 'upi', source: 'direct', checkoutTenantId: tid } as any), 'own-site sale blocked w/o gateway', /payment setup/i);

  /* ── 7. Growth trial features: coupons + team ── */
  const cp = await noThrow(() => api.couponsApi.create(s.userId, { code: 'UDHAY20', type: 'pct', value: 20, courseIds: [cid], maxUses: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 864e5).toISOString() }), 'create coupon on Growth trial');
  ok(!!cp, 'coupon created');
  ok(api.commerce.quote(cid, 'UDHAY20').discountInr === Math.round(2499 * 0.2), 'coupon applies on own course');
  const team = api.teamApi.get(s.userId);
  ok(team.seats.limit === 5, 'Growth has 5 tutor seats', team.seats);
  await noThrow(() => api.teamApi.invite(s.userId, { name: 'Asst Tutor', email: 'asst@test.in', courseIds: [cid] }), 'invite a tutor');

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
}
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
