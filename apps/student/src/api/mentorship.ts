/**
 * 1-on-1 Mentorship API (mock backend with the same contract the real server will honour).
 * Rules live in core/mentorship.ts; this file enforces them against the mock DB.
 *
 * Real backend notes (docs/MENTORSHIP.md):
 *  - every rule below becomes a Postgres function / RLS policy; booking a slot is one atomic UPDATE ... WHERE status='open'
 *  - mentorCalendar.* becomes an OAuth 2.0 connection (Google Calendar API, scope calendar.events) with the refresh token kept server-side
 *  - mentorship.join() becomes POST live-token with room "mentor-<bookingId>", identity = user id, metadata { role }
 */
import { db, persist, uid } from './mockDb';
import { ApiError, catalog, educator } from './client';
import {
  RULES, TOPICS, callWindow, generateSlots, googleCalendarUrl, mentorIcs, minutesUntil, overlaps, slotId, studentCanCancel, toMin, topicLabel, validateWindows,
  type CalEventInput, type MentorBooking, type MentorConfig, type MentorSlot, type TopicId, type Window,
} from '@/core/mentorship';

const SITE = 'https://www.thebodhin.com';
const nameOf = (id: string) => db.users.find((u) => u.id === id)?.name ?? 'Member';
const roleIn = (b: MentorBooking, userId: string): 'student' | 'tutor' | null => (b.studentId === userId ? 'student' : b.tutorId === userId ? 'tutor' : null);

function notify(userId: string, title: string, body: string, pathname: string) {
  db.notifications.push({ id: uid('n'), userId, kind: 'live', title, body, at: new Date().toISOString(), read: false, link: { pathname } });
}
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Is this learner enrolled in any course of the tutor's academy? Only those learners may book. */
function enrolledWithTutor(studentId: string, tutorId: string) {
  const tenantId = educator.context(tutorId)?.tenant.id;
  if (!tenantId) return false;
  return db.enrollments.some((e) => e.userId === studentId && catalog.get(e.courseId)?.course.tenantId === tenantId);
}

/* ─────────────── Google Calendar (adapter) ─────────────── */

function eventInput(b: MentorBooking, viewer: 'student' | 'tutor'): CalEventInput {
  const other = viewer === 'student' ? nameOf(b.tutorId) : nameOf(b.studentId);
  const join = `${SITE}/mentor-call/${b.id}`;
  return {
    id: `mentor-${b.id}-${viewer}`,
    title: `Mentoring: ${topicLabel(b.topic)} with ${other}`,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    description: `${b.note ? `Topic notes: ${b.note}\n` : ''}Join the video call: ${join}`,
    location: join,
  };
}
const linked = (userId: string) => db.calendarLinks.some((l) => l.userId === userId);
function calStatus(userId: string): { connected: boolean; account: string | null } {
  const l = db.calendarLinks.find((x) => x.userId === userId);
  return { connected: !!l, account: l?.account ?? null };
}
function getConfig(userId: string): MentorConfig | null {
  return db.mentorConfigs.find((c) => c.userId === userId) ?? null;
}
/** True when the tutor's current weekly schedule still contains this slot (same weekday, inside a window). */
function slotStillOffered(slot: MentorSlot): boolean {
  const cfg = getConfig(slot.tutorId);
  if (!cfg) return false;
  const s = new Date(slot.startsAt), e = new Date(slot.endsAt);
  const startMin = s.getHours() * 60 + s.getMinutes();
  const endMin = startMin + Math.round((e.getTime() - s.getTime()) / 60000);
  return cfg.windows.some((w) => w.day === s.getDay() && startMin >= toMin(w.start) && endMin <= toMin(w.end));
}

/** Creates (or restores) the calendar entry for one side when that person is connected. */
function syncOn(b: MentorBooking, viewer: 'student' | 'tutor') {
  const userId = viewer === 'student' ? b.studentId : b.tutorId;
  if (!linked(userId)) return;
  b.cal[viewer] = { id: `gcal_${b.id}_${viewer}`, provider: 'google', status: 'synced', at: new Date().toISOString() };
}
function syncOff(b: MentorBooking) {
  for (const v of ['student', 'tutor'] as const) if (b.cal[v]?.status === 'synced') b.cal[v] = { ...b.cal[v]!, status: 'removed', at: new Date().toISOString() };
}

export const mentorCalendar = {
  status(userId: string) {
    return calStatus(userId);
  },

  /** Preview: simulated consent. Real: redirect to Google OAuth and store the token on the server. Existing future bookings are added right away. */
  connect(userId: string, now = new Date()) {
    if (!linked(userId)) {
      const email = db.users.find((u) => u.id === userId)?.email ?? `${userId}@example.com`;
      db.calendarLinks.push({ userId, account: email, connectedAt: now.toISOString() });
    }
    for (const b of db.mentorBookings) {
      const v = roleIn(b, userId);
      if (v && b.status === 'booked' && b.endsAt > now.toISOString() && b.cal[v]?.status !== 'synced') syncOn(b, v);
    }
    persist();
    return calStatus(userId);
  },

  /** Removes this person's synced entries and stops future syncing. */
  disconnect(userId: string) {
    for (const b of db.mentorBookings) {
      const v = roleIn(b, userId);
      if (v && b.cal[v]?.status === 'synced') b.cal[v] = { ...b.cal[v]!, status: 'removed', at: new Date().toISOString() };
    }
    db.calendarLinks = db.calendarLinks.filter((l) => l.userId !== userId);
    persist();
    return calStatus(userId);
  },

  /** The calendar entry for this booking as the viewer sees it: a working Google link, an .ics, and whether it is auto-synced. */
  eventFor(bookingId: string, userId: string, now = new Date()) {
    const b = db.mentorBookings.find((x) => x.id === bookingId);
    const v = b && roleIn(b, userId);
    if (!b || !v) throw new ApiError('not_found', 'Session not found.');
    const e = eventInput(b, v);
    return { event: e, googleUrl: googleCalendarUrl(e), ics: mentorIcs(e, now), synced: b.cal[v]?.status === 'synced' };
  },
};

/* ─────────────── views ─────────────── */

function bookingView(b: MentorBooking, viewer: 'student' | 'tutor', now: Date) {
  return {
    ...b,
    topicLabel: topicLabel(b.topic),
    studentName: nameOf(b.studentId),
    tutorName: nameOf(b.tutorId),
    withName: viewer === 'student' ? nameOf(b.tutorId) : nameOf(b.studentId),
    call: b.status === 'booked' ? callWindow(b.startsAt, b.endsAt, now) : ('ended' as const),
    minutesUntil: minutesUntil(b.startsAt, now),
    synced: b.cal[viewer]?.status === 'synced',
    canCancel: b.status === 'booked' && (viewer === 'tutor' ? b.endsAt > now.toISOString() : studentCanCancel(b.startsAt, now)),
    canComplete: viewer === 'tutor' && b.status === 'booked' && b.startsAt <= now.toISOString(),
  };
}
export type BookingView = ReturnType<typeof bookingView>;

const futureSlots = (tutorId: string, now: Date) =>
  db.mentorSlots.filter((s) => s.tutorId === tutorId && s.status === 'open' && new Date(s.startsAt).getTime() - now.getTime() >= RULES.minLeadMin * 60000).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

/* ─────────────── API ─────────────── */

export const mentorship = {
  /* ── tutor side ── */

  config(userId: string) {
    return getConfig(userId);
  },

  /** Publishes (or updates) the weekly windows and regenerates open slots for the next 14 days. Booked slots are never touched. */
  publish(userId: string, input: { slotMins: number; windows: Window[]; topics: string[] }, now = new Date()) {
    if (!educator.context(userId)) throw new ApiError('forbidden', 'Only educators can publish mentoring slots.');
    const problem = validateWindows(input.windows, input.slotMins);
    if (problem) throw new ApiError('invalid', problem);
    const topics = TOPICS.map((t) => t.id).filter((id) => input.topics.includes(id)) as TopicId[];
    if (!topics.length) throw new ApiError('invalid', 'Pick at least one thing students can book you for.');

    const cfg: MentorConfig = { userId, slotMins: input.slotMins, windows: input.windows.map((w) => ({ day: w.day, start: w.start, end: w.end })), topics, publishedAt: now.toISOString() };
    db.mentorConfigs = [...db.mentorConfigs.filter((c) => c.userId !== userId), cfg];

    // drop future open slots, keep everything booked (and past history)
    db.mentorSlots = db.mentorSlots.filter((s) => !(s.tutorId === userId && s.status === 'open' && s.endsAt > now.toISOString()));
    const booked = db.mentorSlots.filter((s) => s.tutorId === userId && s.status === 'booked');
    let created = 0;
    for (const g of generateSlots(cfg.windows, cfg.slotMins, now)) {
      if (booked.some((b) => overlaps(b, g))) continue; // a booking made under an older schedule still wins
      db.mentorSlots.push({ id: slotId(userId, g.startsAt), tutorId: userId, startsAt: g.startsAt, endsAt: g.endsAt, status: 'open' });
      created++;
    }
    persist();
    return { created, kept: booked.filter((b) => b.endsAt > now.toISOString()).length };
  },

  /** Stops offering mentoring: removes the schedule and every open slot. Existing bookings stay and can be cancelled individually. */
  unpublish(userId: string, now = new Date()) {
    db.mentorConfigs = db.mentorConfigs.filter((c) => c.userId !== userId);
    db.mentorSlots = db.mentorSlots.filter((s) => !(s.tutorId === userId && s.status === 'open'));
    persist();
    return { upcoming: db.mentorBookings.filter((b) => b.tutorId === userId && b.status === 'booked' && b.endsAt > now.toISOString()).length };
  },

  /** Remove one open slot (e.g. you are busy that hour). Booked slots must be cancelled instead. */
  removeSlot(userId: string, slotIdArg: string) {
    const s = db.mentorSlots.find((x) => x.id === slotIdArg && x.tutorId === userId);
    if (!s) throw new ApiError('not_found', 'Slot not found.');
    if (s.status === 'booked') throw new ApiError('booked', 'This slot is booked. Cancel the session instead.');
    db.mentorSlots = db.mentorSlots.filter((x) => x.id !== slotIdArg);
    persist();
  },

  /** Everything the tutor's Mentorship card and manage screen need. */
  overview(userId: string, now = new Date()) {
    const mine = db.mentorBookings.filter((b) => b.tutorId === userId);
    const upcoming = mine.filter((b) => b.status === 'booked' && b.endsAt > now.toISOString()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = mine.filter((b) => !upcoming.includes(b)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 8);
    const open = futureSlots(userId, now);
    const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
    return {
      config: getConfig(userId),
      published: !!getConfig(userId),
      openSlots: open.length,
      nextOpen: open.slice(0, 12),
      upcoming: upcoming.map((b) => bookingView(b, 'tutor', now)),
      past: past.map((b) => bookingView(b, 'tutor', now)),
      stats: { completed: mine.filter((b) => b.status === 'completed').length, last7: mine.filter((b) => b.status !== 'cancelled' && b.startsAt >= weekAgo && b.startsAt <= now.toISOString()).length },
      calendar: calStatus(userId),
    };
  },

  /** Tutor marks a finished session complete and leaves a short note the student can read. */
  complete(userId: string, bookingId: string, note: string, now = new Date()) {
    const b = db.mentorBookings.find((x) => x.id === bookingId && x.tutorId === userId);
    if (!b) throw new ApiError('not_found', 'Session not found.');
    if (b.status !== 'booked') throw new ApiError('state', b.status === 'completed' ? 'This session is already completed.' : 'A cancelled session can’t be completed.');
    if (b.startsAt > now.toISOString()) throw new ApiError('too_early', 'You can mark a session complete once it has started.');
    const text = note.trim();
    if (text.length > RULES.tutorNoteMax) throw new ApiError('invalid', `Keep the note under ${RULES.tutorNoteMax} characters.`);
    b.status = 'completed';
    b.tutorNote = text || undefined;
    notify(b.studentId, 'Session completed', `${nameOf(b.tutorId)} marked your ${topicLabel(b.topic)} session complete${text ? ' and left feedback' : ''}.`, '/mentors');
    persist();
    return bookingView(b, 'tutor', now);
  },

  /* ── student side ── */

  /** Educators this learner may book: those of academies they are enrolled in, who currently publish slots. */
  mentors(userId: string, now = new Date()) {
    const tenants = new Set(db.enrollments.filter((e) => e.userId === userId).map((e) => catalog.get(e.courseId)?.course.tenantId).filter(Boolean) as string[]);
    const tutors = db.memberships.filter((m) => tenants.has(m.tenantId) && (m.role === 'owner' || m.role === 'tutor') && m.userId !== userId);
    return [...new Set(tutors.map((m) => m.userId))]
      .map((id) => ({ tutorId: id, name: nameOf(id), config: getConfig(id), open: futureSlots(id, now).length }))
      .filter((m) => m.config)
      .map((m) => ({ tutorId: m.tutorId, name: m.name, topics: m.config!.topics, slotMins: m.config!.slotMins, openSlots: m.open }))
      .sort((a, b) => b.openSlots - a.openSlots || a.name.localeCompare(b.name));
  },

  slots(userId: string, tutorId: string, now = new Date()) {
    if (!enrolledWithTutor(userId, tutorId)) throw new ApiError('not_enrolled', 'Mentoring is open to learners enrolled in this academy.');
    const cfg = getConfig(tutorId);
    return { topics: cfg?.topics ?? [], slotMins: cfg?.slotMins ?? 30, slots: cfg ? futureSlots(tutorId, now) : [] };
  },

  /** Books one slot. Every check happens before anything is written, so a failed booking leaves no trace. */
  book(userId: string, slotIdArg: string, input: { topic: string; note?: string }, now = new Date()) {
    const slot = db.mentorSlots.find((s) => s.id === slotIdArg);
    if (!slot) throw new ApiError('not_found', 'This slot is no longer available.');
    if (slot.tutorId === userId) throw new ApiError('self', 'You can’t book your own slot.');
    if (slot.status !== 'open') throw new ApiError('taken', 'Someone just booked this slot. Please pick another time.');
    if (new Date(slot.startsAt).getTime() - now.getTime() < RULES.minLeadMin * 60000) throw new ApiError('too_late', `Slots must be booked at least ${RULES.minLeadMin} minutes ahead.`);
    if (!enrolledWithTutor(userId, slot.tutorId)) throw new ApiError('not_enrolled', 'Mentoring is open to learners enrolled in this academy.');
    const cfg = getConfig(slot.tutorId);
    if (!cfg) throw new ApiError('closed', 'This mentor has paused bookings.');
    if (!TOPICS.some((t) => t.id === input.topic) || !cfg.topics.includes(input.topic as TopicId)) throw new ApiError('topic', 'Choose what you want help with.');
    const note = (input.note ?? '').trim();
    if (note.length > RULES.noteMax) throw new ApiError('invalid', `Keep your note under ${RULES.noteMax} characters.`);
    const mine = db.mentorBookings.filter((b) => b.studentId === userId && b.status === 'booked' && b.endsAt > now.toISOString());
    if (mine.length >= RULES.maxUpcomingPerStudent) throw new ApiError('limit', `You can have ${RULES.maxUpcomingPerStudent} upcoming sessions at a time. Cancel one or wait until one is done.`);
    if (mine.some((b) => overlaps(b, slot))) throw new ApiError('clash', 'You already have a session at that time.');

    const b: MentorBooking = {
      id: uid('mb'), slotId: slot.id, tutorId: slot.tutorId, studentId: userId, topic: input.topic as TopicId, note,
      startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'booked', createdAt: now.toISOString(), room: '', cal: {},
    };
    b.room = `mentor-${b.id}`;
    slot.status = 'booked';
    slot.bookingId = b.id;
    db.mentorBookings.push(b);
    syncOn(b, 'student');
    syncOn(b, 'tutor');
    notify(b.tutorId, 'New mentoring booking', `${nameOf(userId)} booked ${topicLabel(b.topic)} on ${fmtWhen(b.startsAt)}.`, '/edu/mentorship');
    notify(userId, 'Mentoring session booked', `${topicLabel(b.topic)} with ${nameOf(b.tutorId)} on ${fmtWhen(b.startsAt)}.`, '/mentors');
    persist();
    return bookingView(b, 'student', now);
  },

  /** The learner's sessions: upcoming first (soonest), then recent history. */
  mine(userId: string, now = new Date()) {
    const all = db.mentorBookings.filter((b) => b.studentId === userId);
    const upcoming = all.filter((b) => b.status === 'booked' && b.endsAt > now.toISOString()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = all.filter((b) => !upcoming.includes(b)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 8);
    return { upcoming: upcoming.map((b) => bookingView(b, 'student', now)), past: past.map((b) => bookingView(b, 'student', now)), calendar: calStatus(userId) };
  },

  /* ── both sides ── */

  /** Cancel. Learners need 2 hours' notice and the slot reopens; a tutor can cancel any time and the slot is withdrawn. The other person is told, and calendar entries are removed. */
  cancel(userId: string, bookingId: string, now = new Date()) {
    const b = db.mentorBookings.find((x) => x.id === bookingId);
    const who = b && roleIn(b, userId);
    if (!b || !who) throw new ApiError('not_found', 'Session not found.');
    if (b.status !== 'booked') throw new ApiError('state', b.status === 'cancelled' ? 'This session is already cancelled.' : 'A completed session can’t be cancelled.');
    if (b.endsAt <= now.toISOString()) throw new ApiError('ended', 'This session has already ended.');
    if (who === 'student' && !studentCanCancel(b.startsAt, now)) throw new ApiError('too_late', `Sessions can be cancelled up to ${RULES.studentCancelBeforeMin / 60} hours before they start. Please message your mentor instead.`);
    b.status = 'cancelled';
    b.cancelledBy = who;
    syncOff(b);
    const slot = db.mentorSlots.find((s) => s.id === b.slotId);
    if (slot) {
      // Reopen only if the tutor's current schedule still offers this time; otherwise the slot stays withdrawn.
      if (who === 'student' && slotStillOffered(slot)) { slot.status = 'open'; slot.bookingId = undefined; }
      else db.mentorSlots = db.mentorSlots.filter((s) => s.id !== b.slotId);
    }
    const other = who === 'student' ? b.tutorId : b.studentId;
    notify(other, 'Mentoring session cancelled', `${nameOf(userId)} cancelled ${topicLabel(b.topic)} on ${fmtWhen(b.startsAt)}.`, who === 'student' ? '/edu/mentorship' : '/mentors');
    persist();
    return bookingView(b, who, now);
  },

  /**
   * Join the video call. Opens 10 minutes before the start. Real: POST live-token → { provider: 'livekit', url, token }.
   * Preview: 'loopback' (two tabs of one device share chat and presence; audio/video need the media server).
   */
  join(userId: string, bookingId: string, now = new Date()) {
    const b = db.mentorBookings.find((x) => x.id === bookingId);
    const who = b && roleIn(b, userId);
    if (!b || !who) throw new ApiError('not_found', 'Session not found.');
    if (b.status === 'cancelled') throw new ApiError('cancelled', 'This session was cancelled.');
    if (b.status === 'completed') throw new ApiError('ended', 'This session has ended.');
    const w = callWindow(b.startsAt, b.endsAt, now);
    if (w === 'too_early') throw new ApiError('too_early', `The room opens ${RULES.joinOpensMin} minutes before the session starts.`);
    if (w === 'ended') throw new ApiError('ended', 'This session has ended.');
    return {
      provider: 'loopback' as 'loopback' | 'livekit',
      url: '',
      token: uid('mtok'),
      room: b.room,
      role: who === 'tutor' ? ('host' as const) : ('student' as const),
      name: nameOf(userId),
      peerName: who === 'tutor' ? nameOf(b.studentId) : nameOf(b.tutorId),
      topic: topicLabel(b.topic),
      note: b.note,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
    };
  },
};
