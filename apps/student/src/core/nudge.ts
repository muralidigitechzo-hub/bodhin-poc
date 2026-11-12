/**
 * Nudges: a short, personal message a tutor sends to a student who is drifting away.
 * Pure TypeScript. The cooldown, the opt-out and the text limits must also be enforced by the server.
 */
import type { Risk } from './retention';

export type NudgeChannel = 'app' | 'email' | 'whatsapp';

export interface Nudge {
  id: string;
  tenantId: string;
  personId: string;
  /** educator who sent it */
  by: string;
  channel: NudgeChannel;
  templateId: string;
  text: string;
  at: string;
  /** why the student was flagged at that moment ("attendance", "inactive") */
  reasons: string[];
}

/** One nudge per student per this many days (so nobody is nagged). */
export const NUDGE_COOLDOWN_DAYS = 3;
export const NUDGE_MIN_CHARS = 10;
export const NUDGE_MAX_CHARS = 600;

export interface NudgeTemplate {
  id: 'friendly' | 'motivate' | 'urgent';
  label: string;
  hint: string;
  text: string;
}

/** {name} student's first name · {course} course title · {tutor} sender's first name · {reason} what we noticed, in a sentence */
export const NUDGE_TEMPLATES: NudgeTemplate[] = [
  { id: 'friendly', label: 'Friendly check-in', hint: 'Warm, no pressure', text: 'Hi {name}, we missed you in {course}! I noticed {reason}. Whenever you are ready, jump back in. I am here if you need any help. – {tutor}' },
  { id: 'motivate', label: 'Motivate', hint: 'Encouraging', text: 'Hi {name}, you have already started something great in {course}. A little progress each day adds up. Can you spend 20 minutes on it this week? – {tutor}' },
  { id: 'urgent', label: 'Get back on track', hint: 'Direct, for long gaps', text: 'Hi {name}, I noticed {reason}. To keep up with {course}, please catch up on the recordings this week and reply if anything is blocking you. – {tutor}' },
];

/** The reason as a sentence a student can read: "you have attended 1 of 4 classes and you have not been active for 9 days". */
export function reasonSentence(risk: Risk): string {
  const parts: string[] = [];
  if (risk.reasons.some((r) => r.kind === 'attendance') && risk.attendance) parts.push(`you have attended ${risk.attendance.attended} of ${risk.attendance.held} classes`);
  if (risk.reasons.some((r) => r.kind === 'inactive')) parts.push(`you have not been active for ${risk.daysInactive} days`);
  return parts.join(' and ') || 'you have been away for a while';
}

export interface NudgeVars {
  name: string;
  course: string;
  tutor: string;
  risk: Risk;
}

const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** Fill the placeholders. Unknown placeholders are left visible so the tutor notices them. */
export function renderNudge(text: string, v: NudgeVars): string {
  return text
    .replace(/\{name\}/g, first(v.name))
    .replace(/\{course\}/g, v.course)
    .replace(/\{tutor\}/g, first(v.tutor))
    .replace(/\{reason\}/g, reasonSentence(v.risk));
}

/** Days left before this student may be nudged again (0 = now). */
export function cooldownLeftDays(lastNudgeAt: string | null | undefined, now = Date.now()) {
  if (!lastNudgeAt) return 0;
  const left = NUDGE_COOLDOWN_DAYS * 864e5 - (now - new Date(lastNudgeAt).getTime());
  return left > 0 ? Math.ceil(left / 864e5) : 0;
}

/** Why this text cannot be sent, or null if it is fine. */
export function textProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < NUDGE_MIN_CHARS) return `Write at least ${NUDGE_MIN_CHARS} characters.`;
  if (t.length > NUDGE_MAX_CHARS) return `Keep it under ${NUDGE_MAX_CHARS} characters.`;
  if (/\{(name|course|tutor|reason)\}/.test(t)) return 'Replace the {placeholders} first.';
  return null;
}

/** wa.me link that opens the tutor's own WhatsApp with the message ready (the tutor taps Send). Null when there is no usable number. */
export function whatsappLink(phone: string, text: string): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`; // Indian mobile saved without the country code
  if (d.length < 11 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** A student counts as "returned" if they were active after the nudge. */
export const returnedAfter = (nudgeAt: string, lastActiveAt: string) => new Date(lastActiveAt).getTime() > new Date(nudgeAt).getTime();

export const agoLabel = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
