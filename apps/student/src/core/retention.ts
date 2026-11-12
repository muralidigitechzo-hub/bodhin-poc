/**
 * Student retention: who is drifting away. Pure TypeScript (no React) — the server must run the same rules.
 * "At risk" = a student who is still enrolled and active, AND
 *   • attended less than 40% of the live classes held for them (judged only after 3 classes, so one miss is not a flag), OR
 *   • has not been active in the app for 7 days or more ("no login" is measured as last activity: lesson, class, quiz).
 */
import type { MemberStatus } from './batch';

export interface RiskRules {
  /** below this attendance % a student is flagged */
  minAttendancePct: number;
  /** attendance is judged only after this many classes were held, so a single miss does not flag anyone */
  minClasses: number;
  /** days without any activity before a student is flagged */
  inactiveDays: number;
}

export const DEFAULT_RISK_RULES: RiskRules = { minAttendancePct: 40, minClasses: 3, inactiveDays: 7 };

export interface RiskInput {
  /** classes the student attended / classes held for them (null when they are not in a batch) */
  attendance: { attended: number; held: number } | null;
  lastActiveAt: string;
  /** status of the student's course(s): only 'active' students are judged */
  status: MemberStatus;
}

export type RiskLevel = 'none' | 'medium' | 'high';

export interface RiskReason {
  kind: 'attendance' | 'inactive';
  /** short sentence for the tutor, e.g. "Attended 1 of 4 classes (25%)" */
  text: string;
}

export interface Risk {
  atRisk: boolean;
  level: RiskLevel;
  reasons: RiskReason[];
  attendancePct: number | null;
  /** classes attended / held (null when the student is not in a batch) */
  attendance: { attended: number; held: number } | null;
  daysInactive: number;
}

const DAY = 864e5;

export function assessRisk(input: RiskInput, rules: RiskRules = DEFAULT_RISK_RULES, now = Date.now()): Risk {
  const daysInactive = Math.max(0, Math.floor((now - new Date(input.lastActiveAt).getTime()) / DAY));
  const pct = input.attendance && input.attendance.held > 0 ? Math.round((input.attendance.attended / input.attendance.held) * 100) : null;
  const none: Risk = { atRisk: false, level: 'none', reasons: [], attendancePct: pct, attendance: input.attendance, daysInactive };
  if (input.status !== 'active') return none; // finished, paused or not yet approved students are not "drifting"

  const reasons: RiskReason[] = [];
  const lowAttendance = !!input.attendance && input.attendance.held >= rules.minClasses && pct != null && pct < rules.minAttendancePct;
  if (lowAttendance) reasons.push({ kind: 'attendance', text: `Attended ${input.attendance!.attended} of ${input.attendance!.held} classes (${pct}%)` });
  const inactive = daysInactive >= rules.inactiveDays;
  if (inactive) reasons.push({ kind: 'inactive', text: `No activity for ${daysInactive} days` });
  if (!reasons.length) return none;

  // both problems together, a very low attendance or two weeks away is "high"; everything else is "medium"
  const high = (lowAttendance && inactive) || (pct != null && lowAttendance && pct < rules.minAttendancePct / 2) || daysInactive >= rules.inactiveDays * 2;
  return { atRisk: true, level: high ? 'high' : 'medium', reasons, attendancePct: pct, attendance: input.attendance, daysInactive };
}

/** Most worrying first: high before medium, then the longest away, then the lowest attendance. */
export function byUrgency<T extends { risk: Risk }>(a: T, b: T) {
  const rank = (r: Risk) => (r.level === 'high' ? 0 : r.level === 'medium' ? 1 : 2);
  return rank(a.risk) - rank(b.risk) || b.risk.daysInactive - a.risk.daysInactive || (a.risk.attendancePct ?? 101) - (b.risk.attendancePct ?? 101);
}

export function summarise(items: { risk: Risk }[]) {
  return {
    atRisk: items.filter((i) => i.risk.atRisk).length,
    high: items.filter((i) => i.risk.level === 'high').length,
    lowAttendance: items.filter((i) => i.risk.reasons.some((r) => r.kind === 'attendance')).length,
    inactive: items.filter((i) => i.risk.reasons.some((r) => r.kind === 'inactive')).length,
  };
}
