/**
 * 1-on-1 Mentorship & Office Hours — pure rules (no React, no storage). Unit-tested in Node.
 *
 *  Tutor publishes WEEKLY WINDOWS (e.g. Tue 18:00–20:00) with a slot length of 15 or 30 minutes.
 *  The next 14 days are turned into bookable SLOTS. A student books one slot for a topic.
 *  Times are the device's local time (like the rest of the app's live classes).
 */
import { buildIcs } from './ics';

export const SLOT_MINS = [15, 30] as const;
export type SlotMins = (typeof SLOT_MINS)[number];

export const TOPICS = [
  { id: 'resume', label: 'Resume review', icon: 'document-text-outline' },
  { id: 'debugging', label: 'Code debugging', icon: 'bug-outline' },
  { id: 'project', label: 'Project feedback', icon: 'rocket-outline' },
  { id: 'other', label: 'Something else', icon: 'chatbubble-ellipses-outline' },
] as const;
export type TopicId = (typeof TOPICS)[number]['id'];
export const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? 'Mentoring session';

export const RULES = {
  /** How many days ahead slots are published. */
  daysAhead: 14,
  /** Nobody can book (or be offered) a slot starting sooner than this. */
  minLeadMin: 30,
  /** Slots are only generated this long after "now", so a tutor isn't surprised by a booking in minutes. */
  publishLeadMin: 60,
  /** A student can cancel up to this long before the start. */
  studentCancelBeforeMin: 120,
  /** The call room opens this long before the start, and stays open this long after the end. */
  joinOpensMin: 10,
  joinGraceMin: 10,
  maxUpcomingPerStudent: 3,
  maxWindows: 14,
  noteMax: 300,
  tutorNoteMax: 500,
} as const;

export interface Window { day: number; start: string; end: string } // day 0 = Sunday … 6 = Saturday; times 'HH:MM'
export interface GeneratedSlot { startsAt: string; endsAt: string }

/* ─────────────── time helpers ─────────────── */

export const toMin = (hhmm: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** Local date + minutes-from-midnight → Date (DST-safe: built from parts). */
const at = (day: Date, min: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(min / 60), min % 60, 0, 0);

/* ─────────────── availability ─────────────── */

/** Returns a human message for the first problem, or null when the weekly windows are valid. */
export function validateWindows(windows: Window[], slotMins: number): string | null {
  if (!SLOT_MINS.includes(slotMins as SlotMins)) return 'Choose a 15 or 30 minute slot length.';
  if (!windows.length) return 'Add at least one weekly time window.';
  if (windows.length > RULES.maxWindows) return `You can add up to ${RULES.maxWindows} windows.`;
  for (const w of windows) {
    if (!Number.isInteger(w.day) || w.day < 0 || w.day > 6) return 'Pick a valid weekday.';
    const s = toMin(w.start), e = toMin(w.end);
    if (Number.isNaN(s) || Number.isNaN(e)) return 'Use times like 18:00.';
    if (e <= s) return 'A window must end after it starts.';
    if (e - s < slotMins) return `A ${slotMins}-minute slot doesn’t fit in ${w.start}–${w.end}.`;
  }
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i], b = windows[j];
      if (a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) return 'Two windows on the same day overlap.';
    }
  }
  return null;
}

/**
 * Turns weekly windows into concrete slots for the next `daysAhead` days. Slots that would start
 * sooner than `publishLeadMin` from `now` are skipped. Partial leftovers at the end of a window are dropped.
 */
export function generateSlots(windows: Window[], slotMins: number, now: Date, daysAhead: number = RULES.daysAhead): GeneratedSlot[] {
  const out: GeneratedSlot[] = [];
  const earliest = now.getTime() + RULES.publishLeadMin * 60000;
  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 12);
    for (const w of windows.filter((x) => x.day === day.getDay())) {
      for (let t = toMin(w.start); t + slotMins <= toMin(w.end); t += slotMins) {
        const start = at(day, t);
        if (start.getTime() < earliest) continue;
        out.push({ startsAt: start.toISOString(), endsAt: at(day, t + slotMins).toISOString() });
      }
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** Stable id so re-publishing the same window never duplicates a slot. */
export const slotId = (tutorId: string, startsAt: string) => `ms_${tutorId}_${startsAt.replace(/[^0-9]/g, '').slice(0, 12)}`;

/* ─────────────── call window / cancellation ─────────────── */

export type CallWindow = 'too_early' | 'open' | 'ended';
export function callWindow(startsAt: string, endsAt: string, now: Date): CallWindow {
  const t = now.getTime();
  if (t < new Date(startsAt).getTime() - RULES.joinOpensMin * 60000) return 'too_early';
  if (t > new Date(endsAt).getTime() + RULES.joinGraceMin * 60000) return 'ended';
  return 'open';
}
export const studentCanCancel = (startsAt: string, now: Date) => new Date(startsAt).getTime() - now.getTime() >= RULES.studentCancelBeforeMin * 60000;
export const minutesUntil = (iso: string, now: Date) => Math.round((new Date(iso).getTime() - now.getTime()) / 60000);

/* ─────────────── calendar ─────────────── */

export interface CalEventInput { id: string; title: string; startsAt: string; endsAt: string; description: string; location: string }

const gstamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A link that opens Google Calendar with this event pre-filled. Works today, no sign-in or server needed. */
export function googleCalendarUrl(e: CalEventInput) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${gstamp(e.startsAt)}/${gstamp(e.endsAt)}`, details: e.description, location: e.location });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** .ics for Apple/Outlook/Google import, with a reminder 15 minutes before. */
export const mentorIcs = (e: CalEventInput, now = new Date()) => buildIcs([{ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, description: `${e.description}\n${e.location}` }], now);

/* ─────────────── records (shared by the mock DB and the API) ─────────────── */

export interface CalEvent { id: string; provider: 'google'; status: 'synced' | 'removed'; at: string }
export interface MentorConfig { userId: string; slotMins: number; windows: Window[]; topics: TopicId[]; publishedAt: string }
export interface MentorSlot { id: string; tutorId: string; startsAt: string; endsAt: string; status: 'open' | 'booked'; bookingId?: string }
export interface MentorBooking {
  id: string;
  slotId: string;
  tutorId: string;
  studentId: string;
  topic: TopicId;
  note: string;
  startsAt: string;
  endsAt: string;
  status: 'booked' | 'cancelled' | 'completed';
  cancelledBy?: 'student' | 'tutor';
  createdAt: string;
  /** Video room name; the call token is issued per participant when they join. */
  room: string;
  /** Calendar entries created for each side when that person has Google Calendar connected. */
  cal: { student?: CalEvent; tutor?: CalEvent };
  tutorNote?: string;
}
