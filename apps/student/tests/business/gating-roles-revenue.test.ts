/* Round 2: gating, scoping, timezone, flags, permission matrix, revenue integrity. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { payoutDateFor, entitlements, splitOrder, paymentRoute } from '@/core/business';
import { PLANS } from '@/core/plans';
import { ROLE_PERMS, type AdminPerm } from '@/core/admin';
import { courses as seedCourses } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn: () => unknown, n: string, m?: RegExp) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e: any) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
async function noThrow(fn: () => unknown, n: string) { try { return await fn(); } catch (e: any) { ok(false, n, e?.message); } }
const snap = JSON.stringify(db);
const reset = () => { const s = JSON.parse(snap); Object.keys(db).forEach((k) => delete (db as any)[k]); Object.assign(db, s); };
const owner = (tid: string) => db.tenants.find((t) => t.id === tid)!.ownerUserId!;

async function main() {
  /* Payout timezone: a sale on Mon 2 Nov is payable in the Mon 9 Nov run */
  {
    reset();
    const run0 = api.money.payoutRun('u_fin');
    const runDay = new Date(run0.date);
    const paidAt = new Date(runDay.getTime() - 7 * 864e5 + 9 * 36e5).toISOString(); // run day − 7d, 9 AM
    const o = db.orders.find((x) => x.channel === 'bodhin_marketplace' && x.status === 'paid' && x.payoutStatus !== 'paid' && x.sellerTenantId === 't_rajesh' && !db.refundRequests.some((r) => r.orderId === x.id && r.status === 'open'))!;
    o.createdAt = paidAt; o.payoutDate = payoutDateFor(paidAt, db.platformConfig);
    const run = api.money.payoutRun('u_fin');
    const raj = run.lines.find((l: any) => l.t.id === 't_rajesh') as any;
    ok(raj && raj.orderIds.includes(o.id), 'sale due on run day is in that run (IST vs UTC)', { pd: o.payoutDate, date: run.date });
    const ov = await api.admin.overview('u_admin');
    ok(ov.pending.payouts.amount >= o.educatorShareInr, 'overview counts it as due');
  }
  /* Plan feature gating (server side) */
  {
    reset();
    const yoga = owner('t_yogawithmeena'); // Starter
    await throws(() => api.couponsApi.create(yoga, { code: 'YOGA20', type: 'pct', value: 20, courseIds: [], maxUses: null, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 864e6).toISOString() }), 'Starter cannot create coupons', /Creator/);
    await throws(() => api.teamApi.invite(yoga, { name: 'Asst', email: 'a@x.in', courseIds: ['x'] }), 'Starter cannot add tutors', /Growth/);
    await throws(() => api.workspaceApi.addDomain(yoga, 'learn.yoga.in'), 'Starter needs domain add-on', /Custom domain/);
    api.workspaceApi.saveBranding(yoga, { displayName: 'Yoga with Meena', tagline: 't', primary: '#0F6E5A', accent: '#F59E0B', hidePoweredBy: true });
    ok(!db.tenants.find((t) => t.id === 't_yogawithmeena')!.branding.hidePoweredBy, 'Starter cannot hide Powered by Bodhin');
    const raj = 'u_rajesh'; // Institute (white label)
    const rb = db.tenants.find((t) => t.id === 't_rajesh')!.branding;
    api.workspaceApi.saveBranding(raj, { displayName: rb.displayName, tagline: rb.tagline ?? '', primary: rb.primary, accent: rb.accent, hidePoweredBy: true });
    ok(db.tenants.find((t) => t.id === 't_rajesh')!.branding.hidePoweredBy === true, 'Institute can hide Powered by');
    // seats: growth 5 seats
    const pri = owner('t_priyacodes');
    const g = api.teamApi.get(pri);
    for (let i = g.seats.used; i < (g.seats.limit ?? 0); i++) await api.teamApi.invite(pri, { name: 'Tutor ' + i, email: `t${i}@x.in`, courseIds: [g.courses[0].id] });
    await throws(() => api.teamApi.invite(pri, { name: 'One more', email: 'more@x.in', courseIds: [g.courses[0].id] }), 'seat limit enforced', /seats/);
  }
  /* Cross-tenant scoping */
  {
    reset();
    const cp = db.coupons.find((c) => c.tenantId === 't_rajesh')!;
    const was = cp.paused;
    api.couponsApi.togglePause(owner('t_priyacodes'), cp.id);
    ok(cp.paused === was, 'owner cannot pause another workspace coupon');
    api.couponsApi.endNow(owner('t_priyacodes'), cp.id);
    ok(db.coupons.some((c) => c.id === cp.id), 'owner cannot end another workspace coupon');
    const tutor = db.memberships.find((m) => m.tenantId === 't_rajesh' && m.role === 'tutor');
    if (tutor) {
      await throws(() => api.teamApi.remove(owner('t_priyacodes'), tutor.userId), 'cannot remove another workspace tutor');
      await throws(() => api.teamApi.setCourses('u_rajesh', tutor.userId, [seedCourses.find((c) => c.tenantId === 't_priyacodes')!.id]), 'cannot assign other workspace course');
    } else ok(true, 'no tutor seeded');
    // domain uniqueness
    const t = db.tenants.find((x) => x.id === 't_rajesh')!;
    const host = t.domain?.host ?? t.customDomain;
    if (host) await throws(() => api.workspaceApi.addDomain(owner('t_tnpscwinners'), host), 'domain cannot be used twice', /another workspace/);
    // downgrade blocked while domain connected
    db.usage.t_rajesh = { activeStudents: 10, storageGb: 1, liveHours: 0, tutorSeats: 1 };
    if (t.domain && !t.subscription!.addons.some((a) => a.kind === 'custom_domain')) await throws(() => api.subscriptionApi.changePlan('u_rajesh', 'growth', 'monthly'), 'downgrade blocked by connected domain', /custom domain/);
  }
  /* Kill switches */
  {
    reset();
    db.flags.liveClasses = false;
    const sid = db.classSessions[0]?.id;
    if (sid) await throws(() => api.liveTab.join('u_arjun', sid), 'live kill switch blocks join', /unavailable|paused/);
    await throws(() => api.liveAdmin.schedule('u_rajesh', { batchId: 'x', title: 'x', description: '', startsAt: new Date().toISOString(), durationMin: 60, instructorId: 'u_rajesh', mode: 'online', settings: {} } as any), 'live kill switch blocks scheduling', /paused/);
    db.flags.liveClasses = true;
  }
  /* Platform config server validation */
  {
    reset();
    const cfg = { ...db.platformConfig };
    await throws(() => api.settingsAdmin.savePlatform('u_admin', { ...cfg, trialPlan: 'enterprise' }, 'bad trial plan'), 'trial plan cannot be enterprise');
    await throws(() => api.settingsAdmin.savePlatform('u_admin', { ...cfg, refundHoldDays: -1 }, 'negative hold'), 'refund hold range');
    await throws(() => api.settingsAdmin.savePlatform('u_fin', { ...cfg, commissionRate: 0.15 }, 'finance tries'), 'finance cannot change commission');
    await noThrow(() => api.settingsAdmin.savePlatform('u_admin', { ...cfg, commissionRate: 0.15, bodhinTenantId: 't_rajesh' }, 'commission to 15'), 'admin changes commission');
    ok(db.platformConfig.bodhinTenantId === 't_bodhin', 'Bodhin tenant id cannot be changed');
    // new sale uses new rate, old orders untouched
    const oldO = db.orders.find((o) => o.channel === 'bodhin_marketplace')!;
    const oldC = oldO.commissionInr;
    const c = seedCourses.find((x) => x.tenantId === 't_rajesh' && x.priceInr > 0)!;
    db.users.push({ id: 'u_z', name: 'Z', email: 'z@z.in', phone: '+919999999999', phoneVerified: true, password: 'x', createdAt: '' } as any);
    const o = await api.commerce.pay({ userId: 'u_z', courseId: c.id, method: 'upi', source: 'direct', checkoutTenantId: null } as any);
    ok(o.commissionInr === Math.round(o.amountInr * 0.15) && oldO.commissionInr === oldC, 'new commission on new sales only');
  }
  /* Permission matrix: each role vs. gated admin APIs */
  {
    reset();
    const calls: [AdminPerm, (u: string) => unknown][] = [
      ['approvals.educators', (u) => api.approvals.decideEducator(u, db.applications[0].id, 'changes_requested', 'please add a sample video')],
      ['tenants.manage', (u) => api.tenantsAdmin.act(u, 't_rajesh', { kind: 'message', title: 'Hello', body: 'Test message' })],
      ['plans.edit', (u) => api.settingsAdmin.saveAddon(u, 'storage', 599, 'test change')],
      ['config.edit', (u) => api.flagsAdmin.save(u, { ...db.flags, liveClasses: !db.flags.liveClasses }, 'test flag')],
      ['payouts.run', (u) => api.money.hold(u, 't_rajesh', 'test hold reason')],
      ['refunds', (u) => api.money.decideRefund(u, 'rf2', 'rejected', 'not eligible now')],
      ['money.view', (u) => api.money.billing(u)],
      ['users.manage', (u) => api.usersAdmin.act(u, 'u_arjun', { kind: 'reset' } as any)],
      ['support.tickets', (u) => api.ticketsAdmin.list(u, 'open' as any)],
      ['broadcast', (u) => api.broadcastAdmin.send(u, { audience: 'all_students', title: 'Hello all', body: 'A test broadcast' })],
      ['admins.manage', (u) => api.staffAdmin.list(u)],
      ['audit.view', (u) => api.auditAdmin.list(u, 'all', '')],
      ['content.bodhin', (u) => api.contentAdmin.curation(u)],
    ];
    const staff: Record<string, keyof typeof ROLE_PERMS> = { u_admin: 'super_admin', u_fin: 'finance', u_mod: 'moderator', u_sup: 'support' };
    for (const [perm, fn] of calls) for (const [u, role] of Object.entries(staff)) {
      reset();
      const allowed = ROLE_PERMS[role].includes(perm);
      let threw: any = null; try { await fn(u); } catch (e: any) { threw = e; }
      const denied = threw && /permission|not allowed|access|admins only|can’t|cannot/i.test(threw.message) && threw.code !== 'reason';
      ok(allowed ? !denied : !!threw, `${role} ${allowed ? 'can' : 'cannot'} ${perm}`, threw?.message);
    }
    // non-staff cannot use admin
    await throws(() => api.money.billing('u_arjun'), 'learner blocked from admin');
    await throws(() => api.money.billing('u_rajesh'), 'educator blocked from admin');
  }
  /* Revenue integrity: Bodhin revenue never includes tutor direct sales */
  {
    reset();
    const ov = await api.admin.overview('u_admin');
    const k = ov.kpis;
    ok(k.bodhinRevenue === k.mrr + k.commission + k.ownSales, 'Bodhin revenue = subscriptions + commission + own sales', k);
    ok(k.gmv === k.direct + k.market + k.ownSales, 'GMV = direct + marketplace + own');
    const before = k.bodhinRevenue;
    db.users.push({ id: 'u_y', name: 'Y', email: 'y@y.in', phone: '+919999999998', phoneVerified: true, password: 'x', createdAt: '' } as any);
    const c = seedCourses.find((x) => x.tenantId === 't_rajesh' && x.priceInr > 0)!;
    await api.commerce.pay({ userId: 'u_y', courseId: c.id, method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' } as any);
    const ov2 = await api.admin.overview('u_admin');
    ok(ov2.kpis.bodhinRevenue === before && ov2.kpis.direct === k.direct + c.priceInr, 'direct sale adds GMV but not Bodhin revenue', [before, ov2.kpis.bodhinRevenue]);
    // educator statement
    const st = await api.earningsApi.statement('u_rajesh', 'month', 'all');
    const mine = db.orders.filter((o) => o.sellerTenantId === 't_rajesh' && o.status === 'paid' && new Date(o.createdAt).getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime());
    const want = mine.reduce((s, o) => s + (o.channel === 'tutor_direct' ? o.amountInr : o.educatorShareInr), 0);
    ok(st.summary.net === want, 'educator net = direct gross + marketplace share', [st.summary.net, want]);
    ok(!st.rows.some((r: any) => r.o.channel === 'bodhin_own'), 'Bodhin own sales not in tutor statement');
    // every marketplace order: split adds up
    ok(db.orders.filter((o) => o.channel === 'bodhin_marketplace').every((o) => o.commissionInr + (o.gatewayFeeInr ?? 0) + o.educatorShareInr === o.amountInr), 'all marketplace orders split exactly', db.orders.filter((o) => o.channel === 'bodhin_marketplace' && o.commissionInr + (o.gatewayFeeInr ?? 0) + o.educatorShareInr !== o.amountInr).map((o) => o.id));
    ok(db.orders.filter((o) => o.channel === 'tutor_direct').every((o) => o.commissionInr === 0 && o.collector === 'educator'), 'direct orders 0% and tutor-collected');
    ok(db.orders.filter((o) => o.channel === 'bodhin_own').every((o) => o.collector === 'bodhin' && o.educatorShareInr === 0), 'own orders 100% Bodhin', db.orders.filter((o) => o.channel === 'bodhin_own' && o.educatorShareInr !== 0).map((o) => [o.id, o.educatorShareInr]));
  }
  /* Moderation: public listing hidden from marketplace until approved */
  {
    reset();
    const pend = seedCourses.find((c) => c.moderation === 'pending' && c.visibility !== 'private');
    if (pend) {
      const ex = await api.catalog.explore(null).catch(() => null) as any;
      const ids = JSON.stringify(ex ?? '');
      ok(!ids.includes(pend.id), 'pending course not on marketplace');
      await throws(() => api.approvals.decideCourse('u_fin', pend.id, 'approve'), 'finance cannot approve course');
      await noThrow(() => api.approvals.decideCourse('u_mod', pend.id, 'approve'), 'moderator approves course');
      const ex2 = JSON.stringify(await api.catalog.explore(null).catch(() => '') ?? '');
      ok(ex2.includes(pend.id), 'approved course appears on marketplace');
    }
  }
  /* Trial → plan choice, past due */
  {
    reset();
    const deepa = owner('t_designwithdeepa');
    const r = await noThrow(() => api.subscriptionApi.changePlan(deepa, 'starter', 'monthly'), 'trial picks Starter') as any;
    ok(r?.mode === 'scheduled', 'cheaper plan starts when trial ends (no charge now)', r);
    const inv = db.invoices.filter((i) => i.tenantId === 't_designwithdeepa').length;
    ok(inv === JSON.parse(snap).invoices.filter((i: any) => i.tenantId === 't_designwithdeepa').length, 'no invoice during trial for a scheduled plan');
  }
  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
}
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
