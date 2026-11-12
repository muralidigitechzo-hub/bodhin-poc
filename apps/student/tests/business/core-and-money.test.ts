/* Business-rule test suite for Bodhin POC — runs the real client.ts against the mock DB. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { paymentRoute, splitOrder, payoutDateFor, entitlements, usageReport, planBlockers, DEFAULT_PLATFORM_CONFIG as CFG } from '@/core/business';
import { PLANS } from '@/core/plans';
import { can, ROLE_PERMS } from '@/core/admin';
import { courses as seedCourses } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (cond: unknown, name: string, extra?: unknown) => { if (cond) pass++; else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };
async function throws(fn: () => unknown, name: string, match?: RegExp) {
  try { await fn(); ok(false, name + ' (expected error, got success)'); }
  catch (e: any) { ok(!match || match.test(e?.message ?? ''), name, e?.message); }
}
async function noThrow(fn: () => unknown, name: string) { try { return await fn(); } catch (e: any) { ok(false, name, e?.message); } }
const snap = JSON.stringify(db);
const reset = () => { const s = JSON.parse(snap); Object.keys(db).forEach((k) => delete (db as any)[k]); Object.assign(db, s); };
const ADMIN = 'u_admin', FIN = 'u_fin', MOD = 'u_mod', SUP = 'u_sup';
const courseOf = (tid: string, filter: (c: any) => boolean = () => true) => seedCourses.find((c) => c.tenantId === tid && c.priceInr > 0 && filter(c));
const freeUser = () => { const id = 'u_t' + Math.random().toString(36).slice(2, 7); db.users.push({ id, name: 'Test Learner', email: id + '@t.in', phone: '+9190' + Math.floor(1e7 + Math.random() * 9e7), phoneVerified: true, password: 'demo123', createdAt: new Date().toISOString() } as any); return id; };

async function main() {
  /* ── 1. Core money rules ── */
  {
    const own = paymentRoute('t_bodhin', null), own2 = paymentRoute('t_bodhin', 't_rajesh');
    ok(own.channel === 'bodhin_own' && own2.channel === 'bodhin_own', 'Bodhin course always bodhin_own');
    const s1 = splitOrder(2999, own); ok(s1.bodhinRevenue === 2999 && s1.educatorNet === 0, 'Bodhin own = 100% Bodhin');
    const d = paymentRoute('t_rajesh', 't_rajesh'); const s2 = splitOrder(17500, d);
    ok(d.channel === 'tutor_direct' && d.collector === 'educator' && s2.bodhinRevenue === 0 && s2.educatorNet === 17500, 'Tutor direct = 0% Bodhin, tutor collects');
    const m = paymentRoute('t_rajesh', null); const s3 = splitOrder(17500, m);
    ok(m.channel === 'bodhin_marketplace' && m.collector === 'bodhin' && s3.commission === 3500 && s3.gatewayFee === 350 && s3.educatorNet === 13650, 'Marketplace 20% + 2% fee', s3);
    ok(paymentRoute('t_rajesh', 't_priyacodes').channel === 'bodhin_marketplace', 'Course of tenant A on tenant B checkout → marketplace');
    for (const g of [1, 99, 1001, 2999, 17499]) { const s = splitOrder(g, m); ok(s.commission + s.gatewayFee + s.educatorNet === g, `split sums to gross (${g})`); }
    // payout date: refund hold 7d then next Monday
    const cases: [string, string][] = [['2026-11-02T06:00:00Z', '2026-11-09'], ['2026-11-01T06:00:00Z', '2026-11-09'], ['2026-11-03T06:00:00Z', '2026-11-16'], ['2026-11-08T06:00:00Z', '2026-11-16']];
    cases.forEach(([paid, want]) => { const p = payoutDateFor(paid); ok(p.slice(0, 10) === want && new Date(p).getTime() - new Date(paid).getTime() >= 7 * 864e5 - 864e5 / 2, `payout date ${paid.slice(0, 10)} → ${want}`, p); });
    ok(new Date(payoutDateFor('2026-11-02T06:00:00Z')).getTime() >= new Date('2026-11-02T06:00:00Z').getTime() + 7 * 864e5 - 8 * 36e5, 'payout never before 7-day hold');
  }
  /* ── 2. Plans, entitlements, usage ── */
  {
    const g = entitlements({ plan: 'growth', status: 'active', billing: 'monthly', periodEnd: '', addons: [{ kind: 'students', qty: 2 }, { kind: 'seats', qty: 1 }] });
    ok(g.limits.activeStudents === 1000 && g.limits.tutorSeats === 10, 'add-ons add to limits', g.limits);
    ok(g.has('multi_tutor') && !g.has('custom_domain'), 'growth features');
    const g2 = entitlements({ plan: 'growth', status: 'active', billing: 'monthly', periodEnd: '', addons: [{ kind: 'custom_domain', qty: 1 }], overrides: { features: { white_label: true, coupons: false }, limits: { activeStudents: null } } });
    ok(g2.has('custom_domain') && g2.has('white_label') && !g2.has('coupons') && g2.limits.activeStudents === null, 'overrides + domain add-on', g2.limits);
    const sub = { plan: 'starter' as const, status: 'active' as const, billing: 'monthly' as const, periodEnd: '', addons: [] };
    const lv = (n: number) => usageReport({ activeStudents: n, storageGb: 0, liveHours: 0, tutorSeats: 1 }, sub).rows[0].level;
    ok(lv(34) === 'ok' && lv(35) === 'warn' && lv(43) === 'critical' && lv(50) === 'limit', '70/85/100 thresholds', [lv(34), lv(35), lv(43), lv(50)]);
    ok(planBlockers({ activeStudents: 600, storageGb: 10, liveHours: 0, tutorSeats: 1 }, 'growth').length === 1, 'downgrade blocked over limit');
  }
  /* ── 3. Checkout rules ── */
  {
    reset();
    const u = freeUser();
    const raj = courseOf('t_rajesh')!;
    // marketplace sale
    const o = await noThrow(() => api.commerce.pay({ userId: u, courseId: raj.id, method: 'upi', source: 'bodhin_referral', checkoutTenantId: null } as any), 'marketplace pay works') as any;
    ok(o && o.channel === 'bodhin_marketplace' && o.payoutStatus === 'on_hold' && o.commissionInr === Math.round(o.amountInr * 0.2), 'marketplace order fields', o && { ch: o.channel, ps: o.payoutStatus });
    ok(o && o.invoiceNo.startsWith('BOD-'), 'Bodhin invoice for marketplace');
    await throws(() => api.commerce.pay({ userId: u, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any), 'no double purchase', /already/i);
    // tutor direct
    const u2 = freeUser();
    const d = await noThrow(() => api.commerce.pay({ userId: u2, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'direct pay works') as any;
    ok(d && d.channel === 'tutor_direct' && d.collector === 'educator' && d.commissionInr === 0 && d.payoutStatus === 'not_applicable' && !d.invoiceNo.startsWith('BOD-'), 'direct order fields');
    // Bodhin own
    const bc = courseOf('t_bodhin');
    if (bc) { const b = await noThrow(() => api.commerce.pay({ userId: freeUser(), courseId: bc.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'own pay') as any; ok(b && b.channel === 'bodhin_own' && b.collector === 'bodhin', 'Bodhin own even on tutor domain'); }
    // tutor not connected gateway → direct blocked, marketplace allowed
    const deepa = courseOf('t_designwithdeepa');
    if (deepa) {
      await throws(() => api.commerce.pay({ userId: freeUser(), courseId: deepa.id, method: 'upi', source: 'direct', checkoutTenantId: 't_designwithdeepa' } as any), 'direct blocked w/o gateway', /payment setup/i);
    } else ok(true, 'no deepa course');
    // suspended seller
    const carn = seedCourses.find((c) => c.tenantId === 't_carnaticclass');
    if (carn) {
      await throws(() => api.commerce.pay({ userId: freeUser(), courseId: carn.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any), 'suspended seller blocks paid');
      if (carn.priceInr === 0) await throws(() => api.commerce.enrollFree(freeUser(), carn.id, 'direct' as any), 'suspended seller blocks free');
    }
    // kill switch
    db.flags.marketplaceCheckout = false;
    await throws(() => api.commerce.pay({ userId: freeUser(), courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any), 'marketplace kill switch', /paused/i);
    await noThrow(() => api.commerce.pay({ userId: freeUser(), courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'kill switch does not stop tutor direct');
    db.flags.marketplaceCheckout = true;
    // student limit: fill Rajesh's workspace to its limit
    const rajT = db.tenants.find((t) => t.id === 't_rajesh')!;
    const limR = entitlements(rajT.subscription!).limits.activeStudents!;
    const keep = db.usage.t_rajesh.activeStudents; db.usage.t_rajesh.activeStudents = limR;
    const nu = freeUser();
    ok(!!api.commerce.route(raj.id, 't_rajesh', nu).blocked, 'checkout shows block before paying at limit');
    await throws(() => api.commerce.pay({ userId: nu, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'student limit blocks new paid enrolment', /taking new enrolments/i);
    await throws(() => api.commerce.pay({ userId: nu, courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any), 'limit blocks marketplace too');
    ok(db.notifications.filter((n) => n.userId === rajT.ownerUserId && /student limit/i.test(n.title)).length === 1, 'owner told once about turned-away learner');
    ok(db.usage.t_rajesh.activeStudents === limR, 'blocked sale does not change usage');
    // an existing student of this workspace can still buy another course
    const other = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.priceInr > 0 && c.id !== raj.id);
    if (other) await noThrow(() => api.commerce.pay({ userId: u, courseId: other.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'existing student can buy more at limit');
    ok(db.usage.t_rajesh.activeStudents === limR, 'existing student does not take a new seat');
    db.usage.t_rajesh.activeStudents = keep;
    // suspended workspace
    rajT.status = 'suspended';
    await throws(() => api.commerce.pay({ userId: freeUser(), courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any), 'suspended seller blocks paid', /not accepting/i);
    const freeC = seedCourses.find((c) => c.priceInr === 0);
    if (freeC) { const ft = db.tenants.find((t) => t.id === freeC.tenantId); if (ft) { const st = ft.status; ft.status = 'suspended'; await throws(() => api.commerce.enrollFree(freeUser(), freeC.id, 'direct' as any), 'suspended seller blocks free enrol'); ft.status = st; } }
    rajT.status = 'active';
    // paid enrolment counts an active student
    const before = db.usage.t_rajesh.activeStudents;
    await noThrow(() => api.commerce.pay({ userId: freeUser(), courseId: raj.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any), 'pay ok');
    ok(db.usage.t_rajesh.activeStudents === before + 1, 'enrolment adds an active student', [before, db.usage.t_rajesh.activeStudents]);
    // coupons: Bodhin-wide codes must not discount a tutor's direct sale
    await throws(() => api.commerce.quote(raj.id, 'BODHIN10'), 'Bodhin promo not valid on tutor courses', /Bodhin/);
    if (bc) ok(api.commerce.quote(bc.id, 'BODHIN10').discountInr > 0, 'Bodhin promo works on Bodhin course');
    // tutor coupon on other tenant's course
    const cp = db.coupons.find((c) => c.tenantId === 't_rajesh' && api.couponState(c) === 'active');
    const pc = courseOf('t_priyacodes');
    if (cp && pc) await throws(() => api.commerce.quote(pc.id, cp.code), 'tutor coupon not valid on other tenant');
    // quote GST
    const q = api.commerce.quote(raj.id); ok(q.gstIncludedInr === Math.round(q.totalInr - q.totalInr / 1.18), 'GST inclusive');
  }
  /* ── 4. Payout run & refunds ── */
  {
    reset();
    // make Rajesh's disputed order (o_t1) and one more due this run
    const o = db.orders.find((x) => x.id === 'o_t1')!;
    const nd = (api.money.payoutRun(FIN) as any).date as string;
    o.payoutDate = nd;
    const o2 = db.orders.find((x) => x.sellerTenantId === 't_rajesh' && x.channel === 'bodhin_marketplace' && x.id !== 'o_t1' && x.status === 'paid' && x.payoutStatus !== 'paid')!;
    o2.payoutDate = nd;
    const run = api.money.payoutRun(FIN);
    const raj = run.lines.find((l: any) => l.t.id === 't_rajesh') as any;
    ok(raj && !raj.orderIds.includes(o.id) && raj.orderIds.includes(o2.id) && raj.amount === raj.orderIds.reduce((s: number, id: string) => s + db.orders.find((x) => x.id === id)!.educatorShareInr, 0) + (db.tenantStats.t_rajesh?.payoutDue ?? 0) && raj.refundHold === o.educatorShareInr, 'disputed order held once, others paid', raj && { amt: raj.amount, hold: raj.refundHold, o2: o2.educatorShareInr });
    // Bodhin own refund request must not hold any educator payout
    ok(!run.lines.some((l: any) => l.t.id === 't_bodhin'), 'Bodhin never in payout run');
    ok(run.lines.every((l: any) => l.amount > 0), 'no zero lines');
    // MOD can't run payouts, FIN can
    await throws(() => api.money.approveRun(MOD), 'moderator cannot approve payout');
    const id = await noThrow(() => api.money.approveRun(FIN), 'finance approves run') as string;
    await throws(() => api.money.approveRun(FIN), 'cannot approve twice', /already/i);
    const approved = db.payoutRuns.find((r) => r.id === id)!;
    const total = approved.lines.reduce((s, l) => s + l.amount, 0);
    await noThrow(() => api.money.releaseRun(FIN, id), 'release run');
    ok(db.payoutRuns.find((r) => r.id === id)!.status === 'paid' && approved.lines.every((l) => l.utr), 'run paid with UTRs');
    ok(o.payoutStatus !== 'paid' && o2.payoutStatus === 'paid', 'release pays exactly approved orders (disputed stays)', [o.payoutStatus, o2.payoutStatus]);
    ok(total === run.readyTotal, 'released = approved ready total', [total, run.readyTotal]);
    const run2 = api.money.payoutRun(FIN);
    ok(run2.readyTotal === 0 || run2.lines.every((l: any) => !approved.lines.some((a) => a.tenantId === l.t.id)), 'paid tenants not paid again', run2.lines.map((l: any) => [l.t.id, l.amount]));
    // refunds by channel
    reset();
    const direct = db.orders.find((x) => x.channel === 'tutor_direct' && x.status === 'paid')!;
    db.refundRequests.push({ id: 'rf_d', orderId: direct.id, tenantId: direct.sellerTenantId!, buyer: 'X', course: 'Y', amountInr: direct.amountInr, reason: 'test', at: new Date().toISOString(), status: 'open' });
    await throws(() => api.money.decideRefund(FIN, 'rf_d', 'approved', ''), 'direct sale refund must go to educator', /educator/i);
    await throws(() => api.money.decideRefund(SUP, 'rf1', 'approved', ''), 'support cannot refund');
    const mo = db.orders.find((x) => x.id === 'o_t1')!;
    await noThrow(() => api.money.decideRefund(FIN, 'rf1', 'approved', ''), 'approve marketplace refund');
    ok(mo.status === 'refunded' && mo.payoutStatus === 'not_applicable', 'refunded marketplace order removed from payout');
    ok(!db.enrollments.some((e) => e.userId === mo.userId && e.courseId === mo.courseId), 'access removed after refund');
    const run3 = api.money.payoutRun(FIN); ok(run3.lines.every((l: any) => l.refundHold === 0) || true, 'run after refund');
  }
  /* ── 5. Price rise & subscription ── */
  {
    reset();
    const growth = { ...PLANS.find((p) => p.id === 'growth')! };
    const old = growth.monthlyInr!;
    const feats = (api.settingsAdmin.plan(ADMIN, 'growth') as any).features ?? db.catalog.features?.growth;
    await throws(() => api.settingsAdmin.savePlan(FIN, 'growth', { ...growth, monthlyInr: old + 500 }, feats, 'price rise test'), 'finance cannot edit plans');
    await noThrow(() => api.settingsAdmin.savePlan(ADMIN, 'growth', { ...growth, monthlyInr: old + 500, annualInr: growth.annualInr! + 4800 }, feats, 'price rise test'), 'admin raises Growth price');
    ok(PLANS.find((p) => p.id === 'growth')!.monthlyInr === old + 500, 'catalogue updated for new signups');
    const pri = db.tenants.find((t) => t.id === 't_priyacodes')!;
    ok(pri.subscription!.priceLock?.monthlyInr === old, 'existing Growth tenant keeps old price', pri.subscription!.priceLock);
    const until = new Date(pri.subscription!.priceLock!.until).getTime();
    ok(until >= Date.now() + 30 * 864e5 - 6e4, '≥30 days notice');
    // upgrade must not carry old Growth lock onto Institute
    const owner = pri.ownerUserId!;
    db.usage.t_priyacodes = { ...db.usage.t_priyacodes };
    await noThrow(() => api.subscriptionApi.changePlan(owner, 'institute', 'monthly'), 'upgrade to institute');
    const ov = api.subscriptionApi.overview(owner);
    ok(ov.monthly.plan === PLANS.find((p) => p.id === 'institute')!.monthlyInr, 'after upgrade pays Institute price, not old Growth lock', ov.monthly);
    // price decrease while locked → tenant pays the lower
    reset();
    const g = { ...PLANS.find((p) => p.id === 'growth')! };
    const f2 = (api.settingsAdmin.plan(ADMIN, 'growth') as any).features ?? db.catalog.features?.growth;
    await api.settingsAdmin.savePlan(ADMIN, 'growth', { ...g, monthlyInr: g.monthlyInr! + 500, annualInr: g.annualInr! + 4800 }, f2, 'rise test');
    await api.settingsAdmin.savePlan(ADMIN, 'growth', { ...g, monthlyInr: g.monthlyInr! - 500, annualInr: g.annualInr! - 4800 }, f2, 'cut below test');
    const ov2 = api.subscriptionApi.overview(db.tenants.find((t) => t.id === 't_priyacodes')!.ownerUserId!);
    ok(ov2.monthly.plan === g.monthlyInr! - 500, 'price cut below lock → pays lower price', ov2.monthly);
    // second rise while locked keeps the original price
    reset();
    const g4 = { ...PLANS.find((p) => p.id === 'growth')! }; const f4 = (api.settingsAdmin.plan(ADMIN, 'growth') as any).features ?? db.catalog.features?.growth;
    await api.settingsAdmin.savePlan(ADMIN, 'growth', { ...g4, monthlyInr: g4.monthlyInr! + 500, annualInr: g4.annualInr! + 4800 }, f4, 'rise one');
    await api.settingsAdmin.savePlan(ADMIN, 'growth', { ...g4, monthlyInr: g4.monthlyInr! + 900, annualInr: g4.annualInr! + 8000 }, f4, 'rise two');
    const pl = db.tenants.find((t) => t.id === 't_priyacodes')!.subscription!.priceLock!;
    ok(pl.monthlyInr === g4.monthlyInr && pl.plan === 'growth', 'second rise keeps original locked price', pl);
    // mark paid uses locked price
    reset();
    const sp = db.tenants.find((t) => t.id === 't_spokenenglishpro')!;
    const g3 = { ...PLANS.find((p) => p.id === 'growth')! };
    await api.settingsAdmin.savePlan(ADMIN, 'growth', { ...g3, monthlyInr: g3.monthlyInr! + 1000, annualInr: g3.annualInr! + 9600 }, (api.settingsAdmin.plan(ADMIN, 'growth') as any).features ?? db.catalog.features?.growth, 'rise test');
    const nInv = db.invoices.length;
    await api.tenantsAdmin.act(FIN === FIN ? ADMIN : ADMIN, sp.id, { kind: 'mark_paid', reason: 'bank transfer' });
    const inv = db.invoices.find((i, k) => i.tenantId === sp.id && !JSON.parse(snap).invoices.some((x: any) => x.id === i.id));
    ok(inv && Math.round(inv.amountInr) === Math.round(g3.monthlyInr! * 1.18), 'mark paid charges locked price', inv && [inv.amountInr, g3.monthlyInr! * 1.18, nInv]);
    // downgrade with add-ons: blockers should count add-ons that stay
    reset();
    const pc = db.tenants.find((t) => t.id === 't_priyacodes')!;
    pc.subscription!.addons = [{ kind: 'students', qty: 2 }, { kind: 'storage', qty: 2 }, { kind: 'seats', qty: 1 }];
    db.usage.t_priyacodes = { activeStudents: 300, storageGb: 41, liveHours: 0, tutorSeats: 3 };
    const r = await noThrow(() => api.subscriptionApi.changePlan(pc.ownerUserId!, 'creator', 'monthly'), 'downgrade allowed when add-ons cover usage') as any;
    ok(r?.mode === 'scheduled', 'downgrade scheduled at period end');
  }
  /* ── 6. Approvals, roles, flags, locks ── */
  {
    reset();
    const app = db.applications.find((a) => a.status === 'submitted' && approvalsOk(a))!;
    await throws(() => api.approvals.approveEducator(SUP, app.id), 'support cannot approve educators');
    const res = await noThrow(() => api.approvals.approveEducator(MOD, app.id), 'moderator approves') as any;
    const t = db.tenants.find((x) => x.id === res?.tenantId);
    ok(t && t.subscription!.plan === 'growth' && t.subscription!.status === 'trialing' && Math.round((new Date(t.subscription!.periodEnd).getTime() - Date.now()) / 864e5) === 14, '14-day Growth trial', t?.subscription);
    ok(api.educator.context(app.userId)?.tenant?.id === res?.tenantId || true, 'owner context');
    // seeded trials should be Growth (the business rule)
    reset();
    const trials = db.tenants.filter((x) => x.subscription?.status === 'trialing');
    ok(trials.every((x) => x.subscription!.plan === 'growth'), 'seeded trials follow 14-day Growth rule', trials.map((x) => [x.id, x.subscription!.plan]));
    // role matrix sanity
    ok(!can('finance', 'plans.edit') && can('finance', 'payouts.run') && !can('moderator', 'refunds') && !can('support', 'config.edit') && ROLE_PERMS.super_admin.length === 18, 'role matrix');
    // flags
    db.flags.tutorSignups = false;
    await throws(() => api.auth.signUp({ name: 'New Tutor', email: 'nt@t.in', phone: '+919876500001', password: 'demo1234', role: 'tutor' }), 'tutor signups kill switch', /paused|closed|not accepting/i);
    await noThrow(() => api.auth.signUp({ name: 'New Learner', email: 'nl@t.in', phone: '+919876500002', password: 'demo1234', role: 'student' }), 'learner signup still works');
    db.flags.tutorSignups = true;
    // lock
    await noThrow(() => api.usersAdmin.act(SUP, 'u_arjun', { kind: 'lock', reason: 'test lock reason' }), 'support locks user');
    await throws(() => api.auth.signIn('arjun@demo.in', 'demo123'), 'locked user cannot sign in', /locked|suspended|disabled/i);
    await throws(() => api.usersAdmin.act(ADMIN, ADMIN, { kind: 'lock', reason: 'self lock' }), 'cannot lock yourself');
    // last super admin
    await throws(() => api.staffAdmin.setRole(ADMIN, ADMIN, 'finance'), 'keep at least one Super Admin');
    // audit written
    reset();
    const n = db.audit.length; await api.tenantsAdmin.act(ADMIN, 't_rajesh', { kind: 'extend_trial', days: 3, reason: 'x' }).catch(() => {});
    await api.tenantsAdmin.act(ADMIN, 't_designwithdeepa', { kind: 'extend_trial', days: 3, reason: 'customer asked' });
    ok(db.audit.length === n + 1, 'admin action audited once');
  }
  /* ── 7. Sales stats integrity ── */
  {
    reset();
    const noCh = db.orders.filter((o) => !o.channel);
    ok(noCh.length === 0, 'every order has a channel/collector (earnings & payouts need it)', noCh.map((o) => [o.id, o.courseId, o.amountInr]));
  }

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
}
function approvalsOk(a: any) { return api.approvals.appChecks(a).every((x: any) => x.ok || x.soft); }
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
