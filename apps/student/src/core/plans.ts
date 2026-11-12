/**
 * Bodhin subscription catalogue — single source of truth for plan limits.
 * Values come from the client pricing proposal (pre-validation hypotheses).
 * NEVER hardcode prices/limits in screens; always read from here (or the API later).
 * Pure TypeScript, no React Native imports → can move to packages/core unchanged.
 */

export type PlanId = 'starter' | 'creator' | 'growth' | 'institute' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  monthlyInr: number | null; // null = custom quote
  annualInr: number | null;
  activeStudents: number | null;
  videoStorageGb: number | null;
  liveRoomHoursPerMonth: number | null;
  tutorSeats: number | null;
  customDomain: 'included' | 'addon' | 'custom';
  recommended?: boolean;
  bestFor: string;
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', monthlyInr: 799, annualInr: 7670, activeStudents: 50, videoStorageGb: 5, liveRoomHoursPerMonth: 10, tutorSeats: 1, customDomain: 'addon', bestFor: 'Individual tutors and small cohorts' },
  { id: 'creator', name: 'Creator', monthlyInr: 1499, annualInr: 14390, activeStudents: 150, videoStorageGb: 20, liveRoomHoursPerMonth: 30, tutorSeats: 1, customDomain: 'addon', bestFor: 'Growing educators and course creators' },
  { id: 'growth', name: 'Growth', monthlyInr: 3499, annualInr: 33590, activeStudents: 500, videoStorageGb: 50, liveRoomHoursPerMonth: 100, tutorSeats: 5, customDomain: 'addon', recommended: true, bestFor: 'Established educators and academies' },
  { id: 'institute', name: 'Institute', monthlyInr: 7999, annualInr: 76790, activeStudents: 1500, videoStorageGb: 150, liveRoomHoursPerMonth: 250, tutorSeats: 25, customDomain: 'included', bestFor: 'Larger institutes and multi-tutor teams' },
  { id: 'enterprise', name: 'Enterprise', monthlyInr: null, annualInr: null, activeStudents: null, videoStorageGb: null, liveRoomHoursPerMonth: null, tutorSeats: null, customDomain: 'custom', bestFor: 'Large or specialized deployments' },
];

export const getPlan = (id: PlanId) => PLANS.find((p) => p.id === id)!;

/** Usage alert thresholds from the pricing doc: 70% warn, 85% prominent, 100% enforce. */
export type UsageLevel = 'ok' | 'warn' | 'critical' | 'limit';
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit == null) return 'ok';
  const pct = used / limit;
  if (pct >= 1) return 'limit';
  if (pct >= 0.85) return 'critical';
  if (pct >= 0.7) return 'warn';
  return 'ok';
}

/* Commission, fees and payout timing live in core/business.ts (paymentRoute / splitOrder / PlatformConfig). */
