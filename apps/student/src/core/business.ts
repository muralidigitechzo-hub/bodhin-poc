/**
 * Bodhin commercial rules — payment routing, payouts, plan entitlements, usage.
 * Pure TypeScript (no React). Every number here is a DEFAULT that Super Admin can change
 * (PlatformConfig); screens and the backend must read the live config, never these literals.
 */
import { PLANS, usageLevel, type PlanId, type UsageLevel } from './plans';

/* ─────────────── Platform config (Super Admin editable) ─────────────── */

export interface PlatformConfig {
  commissionRate: number; // share Bodhin keeps on marketplace sales (0.2 = 20%)
  attributionDays: number; // proposed qualifying referral window
  gatewayFeeRate: number; // payment gateway fee on Bodhin-collected sales, passed to the payout statement
  refundHoldDays: number; // payout released only after the refund window
  payoutWeekday: number; // 1 = Monday
  trialDays: number; // free trial for new workspaces
  trialPlan: PlanId;
  bodhinTenantId: string; // the tenant that owns Bodhin's own courses
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  commissionRate: 0.2,
  attributionDays: 30,
  gatewayFeeRate: 0.02,
  refundHoldDays: 7,
  payoutWeekday: 1,
  trialDays: 14,
  trialPlan: 'growth',
  bodhinTenantId: 't_bodhin',
};

/* ─────────────── Payment routing: who collects the money ─────────────── */

/**
 * The three sales channels agreed with the client:
 *  bodhin_own         Bodhin's own course                         → Bodhin collects, keeps 100%
 *  tutor_direct       sold on the tutor's subdomain / custom domain / private link / manual enroll
 *                                                                → tutor's own gateway collects, Bodhin 0%
 *  bodhin_marketplace tutor's course bought on thebodhin.com     → Bodhin collects, pays tutor minus commission
 * Rule: whoever hosts the checkout page collects the payment.
 */
export type SalesChannel = 'bodhin_own' | 'tutor_direct' | 'bodhin_marketplace';

export interface PaymentRoute {
  channel: SalesChannel;
  collector: 'bodhin' | 'educator';
  sellerTenantId: string;
  commissionRate: number;
}

export function paymentRoute(courseTenantId: string, checkoutTenantId: string | null, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG): PaymentRoute {
  if (courseTenantId === cfg.bodhinTenantId) return { channel: 'bodhin_own', collector: 'bodhin', sellerTenantId: courseTenantId, commissionRate: 1 };
  if (checkoutTenantId === courseTenantId) return { channel: 'tutor_direct', collector: 'educator', sellerTenantId: courseTenantId, commissionRate: 0 };
  return { channel: 'bodhin_marketplace', collector: 'bodhin', sellerTenantId: courseTenantId, commissionRate: cfg.commissionRate };
}

/** Money split for one paid order (all INR, GST-inclusive gross). */
export function splitOrder(gross: number, route: PaymentRoute, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG) {
  if (route.channel === 'bodhin_own') return { gross, commission: gross, gatewayFee: 0, educatorNet: 0, bodhinRevenue: gross };
  if (route.channel === 'tutor_direct') return { gross, commission: 0, gatewayFee: 0, educatorNet: gross, bodhinRevenue: 0 }; // tutor's own gateway charges them directly
  const commission = Math.round(gross * route.commissionRate);
  const gatewayFee = Math.round(gross * cfg.gatewayFeeRate);
  return { gross, commission, gatewayFee, educatorNet: gross - commission - gatewayFee, bodhinRevenue: commission };
}

/** When a marketplace sale becomes payable: after the refund hold, on the next payout weekday. */
export function payoutDateFor(paidAt: string, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG) {
  const d = new Date(paidAt);
  d.setDate(d.getDate() + cfg.refundHoldDays);
  while (d.getDay() !== cfg.payoutWeekday) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  bodhin_own: 'Bodhin course',
  tutor_direct: 'Direct sale',
  bodhin_marketplace: 'Bodhin marketplace',
};

/* ─────────────── Plan entitlements (feature gating) ─────────────── */

export type Feature =
  | 'courses'
  | 'recorded_video'
  | 'live_classes'
  | 'assessments'
  | 'certificates'
  | 'batches'
  | 'multi_tutor'
  | 'marketplace'
  | 'coupons'
  | 'advanced_reports'
  | 'custom_domain'
  | 'white_label';

/** Default feature map per plan (from the plan positioning in the pricing proposal). Super Admin can override per plan or tenant. */
export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  starter: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace'],
  creator: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons'],
  growth: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports'],
  institute: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports', 'custom_domain', 'white_label'],
  enterprise: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports', 'custom_domain', 'white_label'],
};

export interface TenantSubscription {
  plan: PlanId;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  billing: 'monthly' | 'annual';
  periodEnd: string;
  pending?: { plan: PlanId; billing: 'monthly' | 'annual'; at: string } | null; // downgrade scheduled for period end
  /** Old price kept after a price rise (notice period). Applies only while on `plan`; the lower of lock and catalogue wins. */
  priceLock?: { plan?: PlanId; monthlyInr: number | null; annualInr: number | null; until: string } | null;
  addons: { kind: 'students' | 'storage' | 'live_hours' | 'seats' | 'custom_domain'; qty: number }[];
  /** Super Admin overrides (feature on/off, limit changes) — applied on top of the plan. */
  overrides?: { features?: Partial<Record<Feature, boolean>>; limits?: Partial<Limits> };
}

export interface Limits {
  activeStudents: number | null;
  storageGb: number | null;
  liveHours: number | null;
  tutorSeats: number | null;
}

export const ADDON_SIZES = { students: 250, storage: 25, live_hours: 20, seats: 5 } as const;

/** Monthly add-on prices (₹, GST extra) — launch hypothesis, Super Admin editable. */
export const ADDON_CATALOG: { kind: 'students' | 'storage' | 'live_hours' | 'seats' | 'custom_domain'; label: string; unit: string; monthlyInr: number; icon: string }[] = [
  { kind: 'students', label: 'Student block', unit: '+250 active students', monthlyInr: 999, icon: 'people' },
  { kind: 'storage', label: 'Video storage', unit: '+25 GB', monthlyInr: 499, icon: 'server' },
  { kind: 'live_hours', label: 'Live room-hours', unit: '+20 hours / month', monthlyInr: 699, icon: 'radio' },
  { kind: 'seats', label: 'Tutor seats', unit: '+5 seats', monthlyInr: 1499, icon: 'person-add' },
  { kind: 'custom_domain', label: 'Custom domain', unit: 'your own domain + SSL', monthlyInr: 499, icon: 'globe' },
];

/** Which usage would exceed a plan's limits (blocks a downgrade until reduced). Add-ons the tenant keeps count toward the new plan. */
export function planBlockers(usage: UsageSnapshot, plan: PlanId, addons: TenantSubscription['addons'] = []) {
  const { limits } = entitlements({ plan, status: 'active', billing: 'monthly', periodEnd: '', addons });
  const checks: [string, number, number | null][] = [
    ['active students', usage.activeStudents, limits.activeStudents],
    ['GB of video', usage.storageGb, limits.storageGb],
    ['tutor seats', usage.tutorSeats, limits.tutorSeats],
  ];
  return checks.filter(([, used, limit]) => limit != null && used > limit).map(([l, used, limit]) => `${used} ${l} (plan allows ${limit})`);
}

export function entitlements(sub: TenantSubscription) {
  const plan = PLANS.find((p) => p.id === sub.plan)!;
  const add = (k: keyof typeof ADDON_SIZES) => sub.addons.filter((a) => a.kind === k).reduce((s, a) => s + a.qty * ADDON_SIZES[k], 0);
  const base: Limits = {
    activeStudents: plan.activeStudents == null ? null : plan.activeStudents + add('students'),
    storageGb: plan.videoStorageGb == null ? null : plan.videoStorageGb + add('storage'),
    liveHours: plan.liveRoomHoursPerMonth == null ? null : plan.liveRoomHoursPerMonth + add('live_hours'),
    tutorSeats: plan.tutorSeats == null ? null : plan.tutorSeats + add('seats'),
  };
  const limits = { ...base, ...(sub.overrides?.limits ?? {}) };
  const features = new Set<Feature>(PLAN_FEATURES[sub.plan]);
  if (sub.addons.some((a) => a.kind === 'custom_domain')) features.add('custom_domain');
  Object.entries(sub.overrides?.features ?? {}).forEach(([f, on]) => (on ? features.add(f as Feature) : features.delete(f as Feature)));
  return { plan, limits, has: (f: Feature) => features.has(f), features: [...features] };
}

export interface UsageSnapshot {
  activeStudents: number;
  storageGb: number;
  liveHours: number;
  tutorSeats: number;
}

export const USAGE_META: { key: keyof UsageSnapshot; limit: keyof Limits; label: string; unit: string; icon: string; atLimit: string }[] = [
  { key: 'activeStudents', limit: 'activeStudents', label: 'Active students', unit: '', icon: 'people', atLimit: 'New enrolments are paused until you upgrade or add a student block. Existing students keep full access.' },
  { key: 'storageGb', limit: 'storageGb', label: 'Video storage', unit: 'GB', icon: 'server', atLimit: 'New uploads are paused. Nothing is deleted; existing videos keep playing.' },
  { key: 'liveHours', limit: 'liveHours', label: 'Live room-hours', unit: 'h', icon: 'radio', atLimit: 'New live classes can’t be scheduled this month. Classes already running are never cut off.' },
  { key: 'tutorSeats', limit: 'tutorSeats', label: 'Tutor seats', unit: '', icon: 'person-add', atLimit: 'You can’t invite more tutors until you add seats.' },
];

/** Usage with the 70 / 85 / 100% policy applied. */
export function usageReport(usage: UsageSnapshot, sub: TenantSubscription) {
  const { limits } = entitlements(sub);
  const rows = USAGE_META.map((m) => {
    const used = usage[m.key];
    const limit = limits[m.limit];
    const level: UsageLevel = usageLevel(used, limit);
    return { ...m, used, limit, pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0, level };
  });
  const order: UsageLevel[] = ['limit', 'critical', 'warn', 'ok'];
  const worst = rows.slice().sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))[0];
  return { rows, worst: worst.level === 'ok' ? null : worst };
}

export const daysLeft = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 864e5));
