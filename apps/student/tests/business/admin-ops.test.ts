/* Admin operations driven by real user actions: refunds (marketplace → Finance, direct → educator),
   support tickets → Support, broadcast → learners, all audited. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn: () => unknown, n: string, m?: RegExp) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
async function noThrow<T>(fn: () => T | Promise<T>, n: string): Promise<T | undefined> { try { return await fn(); } catch (e: any) { ok(false, n, e?.message); return undefined; } }
const newLearner = async (tag: string) => { const s = await api.auth.signUp({ name: `Learner ${tag}`, email: `${tag}@t.in`, phone: `98760${String(Math.floor(10000 + Math.random() * 89999))}`, password: 'demo1234', role: 'student' }); await api.auth.verifySignupOtp(s.userId, '123456'); return s.userId; };

async function main() {
  const raj = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.priceInr > 0)!;

  /* ── Marketplace refund: learner → Finance → learner ── */
  const L1 = await newLearner('ref1');
  const o1 = await api.commerce.pay({ userId: L1, courseId: raj.id, method: 'upi', source: 'bodhin_referral', checkoutTenantId: null } as any);
  await throws(() => api.payments.requestRefund(L1, o1.id, 'short'), 'refund reason needs 10+ chars', /10/);
  await throws(() => api.payments.requestRefund('u_arjun', o1.id, 'not my order but trying'), 'cannot refund someone else order', /not found/i);
  await noThrow(() => api.payments.requestRefund(L1, o1.id, 'Course was not what I expected'), 'learner requests refund');
  await throws(() => api.payments.requestRefund(L1, o1.id, 'Course was not what I expected'), 'no duplicate refund request', /already/i);
  ok(api.payments.refundWindow(o1).pending, 'order shows refund pending');
  const fin = api.money.refunds('u_fin');
  const row = fin.rows.find((x) => x.r.orderId === o1.id);
  ok(row && row.r.status === 'open' && row.plan.payer === 'bodhin', 'Finance sees the marketplace refund');
  ok(api.payments.refundWindow(o1).open, 'within the refund window');
  ok(!(await api.money.payoutRun('u_fin')).lines.some((l: any) => (l.orderIds ?? []).includes(o1.id)), 'disputed order kept out of payout run');
  await throws(() => api.money.decideRefund('u_sup', row!.r.id, 'approved', ''), 'support cannot approve refunds');
  await noThrow(() => api.money.decideRefund('u_fin', row!.r.id, 'approved', ''), 'Finance approves refund');
  ok(db.orders.find((o) => o.id === o1.id)!.status === 'refunded', 'order refunded');
  ok(!db.enrollments.some((e) => e.userId === L1 && e.courseId === raj.id), 'learner loses access');
  ok(db.notifications.some((n) => n.userId === L1 && /Refund approved/.test(n.title)), 'learner notified of refund');
  ok(db.audit.some((a) => a.action === 'refund.approve' && a.target.id === o1.id), 'refund audited');
  ok(api.payments.refundWindow(db.orders.find((o) => o.id === o1.id)!).decided === 'approved', 'payments screen shows refunded');

  /* ── Direct-sale refund: learner → educator (not Bodhin) ── */
  const L2 = await newLearner('ref2');
  const o2 = await api.commerce.pay({ userId: L2, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any);
  ok(o2.channel === 'tutor_direct', 'direct sale');
  await noThrow(() => api.payments.requestRefund(L2, o2.id, 'Bought by mistake, sorry'), 'learner requests refund on direct sale');
  ok(db.notifications.some((n) => n.userId === 'u_rajesh' && /Refund request on a direct sale/.test(n.title)), 'educator notified');
  ok(db.notifications.some((n) => n.userId === L2 && /Rajesh|academy/i.test(n.body) && /Refund request received/.test(n.title)), 'learner told the academy reviews it');
  const edu = api.earningsApi.refundRequests('u_rajesh');
  const er = edu.find((x) => x.o.id === o2.id);
  ok(er && er.r.status === 'open', 'educator sees the request in Earnings');
  ok(!api.earningsApi.refundRequests('u_rajesh').some((x) => x.o.channel !== 'tutor_direct'), 'educator sees only direct-sale refunds');
  const fr = api.money.refunds('u_fin').rows.find((x) => x.r.orderId === o2.id);
  await throws(() => api.money.decideRefund('u_fin', fr!.r.id, 'approved', ''), 'Finance cannot refund a direct sale', /educator/i);
  await throws(() => api.earningsApi.decideRefund('u_rajesh', er!.r.id, 'rejected', 'no'), 'decline needs a note', /5/);
  await noThrow(() => api.earningsApi.decideRefund('u_rajesh', er!.r.id, 'approved', ''), 'educator approves');
  ok(db.orders.find((o) => o.id === o2.id)!.status === 'refunded' && !db.enrollments.some((e) => e.userId === L2 && e.courseId === raj.id), 'direct refund applied');
  // another owner cannot touch it
  const L3 = await newLearner('ref3');
  const o3 = await api.commerce.pay({ userId: L3, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any);
  await api.payments.requestRefund(L3, o3.id, 'Changed my mind honestly');
  const r3 = db.refundRequests.find((r) => r.orderId === o3.id)!;
  const other = db.tenants.find((t) => t.id === 't_priyacodes')!.ownerUserId!;
  await throws(() => api.earningsApi.decideRefund(other, r3.id, 'approved', ''), 'other academy cannot decide', /not found/i);

  /* ── Support ticket loop ── */
  const tk = await noThrow(() => api.support.raise(L3, { category: 'payments', subject: 'Invoice GSTIN wrong', body: 'Please update my GSTIN on the invoice for my company.' }), 'learner raises ticket') as any;
  const ids = db.tickets.map((t) => t.id);
  ok(new Set(ids).size === ids.length, 'ticket ids are unique', ids.filter((x, i) => ids.indexOf(x) !== i));
  const tl: any = api.ticketsAdmin.list('u_sup', 'open' as any);
  ok(JSON.stringify(tl).includes(tk?.id ?? '__'), 'Support sees the new ticket');
  await noThrow(() => api.ticketsAdmin.reply('u_sup', tk.id, 'Updated your GSTIN and re-sent the invoice.', true), 'Support replies & resolves');
  ok(db.tickets.find((t) => t.id === tk.id)?.status === 'resolved', 'ticket resolved');
  ok(db.notifications.some((n) => n.userId === L3 && /ticket|reply|support/i.test(n.title + n.body)), 'learner notified of support reply');

  /* ── Broadcast ── */
  await noThrow(() => api.broadcastAdmin.send('u_admin', { audience: 'all_students', title: 'Diwali offer live', body: 'Bodhin courses 20% off this week.' }), 'admin broadcasts');
  ok(db.notifications.some((n) => n.userId === L3 && /Diwali/.test(n.title)), 'new learner receives broadcast');
  await throws(() => api.broadcastAdmin.send('u_fin', { audience: 'all_students', title: 'x title', body: 'x body text' }), 'finance cannot broadcast');

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
}
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
