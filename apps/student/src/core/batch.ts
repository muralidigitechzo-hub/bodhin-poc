/** Batches (cohorts), workspace students, class sessions, attendance, announcements. Pure TS. */

export interface Slot {
  day: number; // 0 = Sunday … 6 = Saturday
  start: string; // '16:00'
  end: string; // '18:00'
  mode: 'online' | 'offline';
}

export interface Batch {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  code: string; // used in the enrollment link
  type: 'cohort' | 'live_only';
  instructorIds: string[]; // user ids (owner / tutors)
  capacity: number;
  startDate: string; // ISO date
  endDate: string;
  slots: Slot[];
  enrollment: { selfEnroll: boolean; approval: boolean; closesAt: string };
  createdAt: string;
  status?: 'draft' | 'published';
}

export type MemberStatus = 'active' | 'on_hold' | 'completed' | 'pending';

export interface PersonCourse {
  courseId: string;
  batchId?: string;
  progress: number; // 0–100 (demo); real users read their enrollment
  enrolledAt: string;
  status: MemberStatus;
}

/** A student as the workspace sees them (real: users + memberships + enrollments). */
export interface Person {
  id: string;
  tenantId: string;
  userId?: string; // linked Bodhin account (gets notifications)
  name: string;
  email: string;
  phone: string;
  enrollmentId: string;
  joinedAt: string;
  lastActiveAt: string;
  courses: PersonCourse[];
  learningMinutes: number;
  streak: number;
  scores: { title: string; pct: number | null }[];
  notes: { id: string; text: string; at: string; by: string }[];
  /** the student asked not to receive nudges: never message them from the radar */
  nudgeOptOut?: boolean;
}

export interface ClassSession {
  id: string;
  batchId: string;
  no: number;
  title: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  mode: 'online' | 'offline';
  status: 'scheduled' | 'conducted' | 'cancelled';
  recording?: boolean;
  description?: string;
  instructorId?: string;
  settings?: { record: boolean; saveToCourse: boolean; qa: boolean; chat: boolean; trackAttendance: boolean };
  reminders?: number[]; // minutes before start
}

/** What a finished class leaves behind (summary page + students' recording). */
export interface LiveSummary {
  sessionId: string;
  endedAt: string;
  durationSec: number;
  peak: number;
  attended: number;
  total: number;
  text: string;
  takeaways: string[];
  chapters: { atSec: number; label: string }[];
  materials: { name: string; size: string; kind: 'pdf' | 'link' | 'video'; url?: string }[];
  qa: { q: string; by: string; a?: string; votes: number }[];
  polls: { q: string; options: string[]; votes: number[] }[];
  chatCount: number;
  recordingPublished: boolean;
  /** Set by the recording pipeline when the file is ready (real: signed URL is issued on demand). */
  recordingUrl?: string;
  sharedAt?: string;
}

export type Mark = 'present' | 'late' | 'absent';
export interface AttendanceMark {
  sessionId: string;
  personId: string;
  status: Mark;
  note?: string;
}

export interface Announcement {
  id: string;
  tenantId: string;
  batchId: string | null; // null = all workspace students
  title: string;
  body: string;
  kind: 'class' | 'assignment' | 'recording' | 'general';
  pinned: boolean;
  status: 'sent' | 'scheduled' | 'draft';
  createdAt: string;
  sendAt?: string;
  audience: 'batch' | 'low_attendance';
  reached: number;
  by: string;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const weeksBetween = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (7 * 864e5)));

export function batchStatus(b: Batch, now = Date.now()): 'upcoming' | 'active' | 'completed' {
  if (now < new Date(b.startDate).getTime()) return 'upcoming';
  if (now > new Date(b.endDate).getTime() + 864e5) return 'completed';
  return 'active';
}

const at = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
};

/** One session per slot per week between start and end (inclusive). */
export function generateSessions(b: Batch, topics: string[], idPrefix: string): ClassSession[] {
  const out: ClassSession[] = [];
  const end = new Date(b.endDate);
  end.setHours(23, 59, 0, 0);
  const d = new Date(b.startDate);
  d.setHours(0, 0, 0, 0);
  let no = 0;
  while (d <= end && no < 120) {
    for (const s of b.slots.filter((x) => x.day === d.getDay())) {
      const topic = topics.length ? topics[no % topics.length] : `Session ${no + 1}`;
      no += 1;
      out.push({ id: `${idPrefix}_${no}`, batchId: b.id, no, title: `Class ${no} – ${topic}`, topic, startsAt: at(d, s.start).toISOString(), endsAt: at(d, s.end).toISOString(), mode: s.mode, status: 'scheduled' });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function attendancePct(marks: AttendanceMark[]) {
  if (!marks.length) return null;
  const ok = marks.filter((m) => m.status !== 'absent').length;
  return Math.round((ok / marks.length) * 100);
}

export const attendanceBand = (pct: number | null) => (pct == null ? 'none' : pct >= 90 ? 'excellent' : pct >= 75 ? 'good' : 'attention');

export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
};

export const slotLabel = (slots: Slot[]) => {
  if (!slots.length) return 'No weekly slots';
  const days = slots.map((s) => DAY_SHORT[s.day]).join(' & ');
  const same = slots.every((s) => s.start === slots[0].start && s.end === slots[0].end);
  return same ? `${days} · ${fmtTime(slots[0].start)} – ${fmtTime(slots[0].end)}` : days;
};
