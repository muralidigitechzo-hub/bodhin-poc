// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* 1-on-1 Mentorship: weekly availability → slots, booking rules, cancellation, completion, call window, calendar sync. */
import { db } from '@/api/mockDb';
import { mentorCalendar, mentorship } from '@/api/mentorship';
import {
  RULES, callWindow, fromMin, generateSlots, googleCalendarUrl, mentorIcs, minutesUntil, overlaps, slotId, studentCanCancel, toMin, topicLabel, validateWindows,
} from '@/core/mentorship';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const err = (fn: () => unknown, code: RegExp | string, n: string) => {
  try { fn(); ok(false, n + ' (expected an error)'); } catch (e: any) { ok(typeof code === 'string' ? e?.code === code : code.test(e?.message ?? ''), n, { code: e?.code, msg: e?.message }); }
};
const mins = (d: Date, n: number) => new Date(d.getTime() + n * 60000);

const NOW = new Date(2026, 10, 12, 10, 0, 0); // Thursday 12 Nov 2026, 10:00 local
const TUTOR = 'u_meera', TUTOR2 = 'u_rajesh', STUDENT = 'u_arjun', STUDENT2 = 'u_stu2', OUTSIDER = 'u_outsider';
const WIN = [{ day: 4, start: '18:00', end: '20:00' }, { day: 5, start: '10:00', end: '11:00' }, { day: 1, start: '09:00', end: '10:00' }];
const ALL_TOPICS = ['resume', 'debugging', 'project', 'other'];

/* ─────────────── core: time + validation ─────────────── */
ok(toMin('00:00') === 0 && toMin('18:30') === 1110 && toMin('23:59') === 1439, 'toMin parses HH:MM');
ok(Number.isNaN(toMin('24:00')) && Number.isNaN(toMin('7:30')) && Number.isNaN(toMin('18:60')) && Number.isNaN(toMin('abc')), 'toMin rejects bad times');
ok(fromMin(1110) === '18:30' && fromMin(5) === '00:05', 'fromMin pads');

ok(validateWindows(WIN, 30) === null, 'valid windows pass');
ok(validateWindows([{ day: 2, start: '09:00', end: '10:00' }, { day: 2, start: '10:00', end: '11:00' }], 30) === null, 'back-to-back windows on one day are fine');
ok(/15 or 30/.test(validateWindows(WIN, 20)), 'slot length must be 15 or 30');
ok(/15 or 30/.test(validateWindows(WIN, 45)), '45 minutes is not allowed');
ok(/at least one/.test(validateWindows([], 30)), 'needs a window');
ok(/valid weekday/.test(validateWindows([{ day: 7, start: '09:00', end: '10:00' }], 30)), 'weekday 7 invalid');
ok(/valid weekday/.test(validateWindows([{ day: -1, start: '09:00', end: '10:00' }], 30)), 'weekday -1 invalid');
ok(/valid weekday/.test(validateWindows([{ day: 1.5, start: '09:00', end: '10:00' }], 30)), 'fractional weekday invalid');
ok(/times like/.test(validateWindows([{ day: 1, start: '9am', end: '10:00' }], 30)), 'bad time format');
ok(/end after/.test(validateWindows([{ day: 1, start: '10:00', end: '10:00' }], 30)), 'zero-length window');
ok(/end after/.test(validateWindows([{ day: 1, start: '11:00', end: '10:00' }], 30)), 'reversed window');
ok(/doesn’t fit/.test(validateWindows([{ day: 1, start: '10:00', end: '10:20' }], 30)), '30-min slot does not fit in 20 minutes');
ok(validateWindows([{ day: 1, start: '10:00', end: '10:20' }], 15) === null, '15-min slot fits in 20 minutes');
ok(/overlap/.test(validateWindows([{ day: 2, start: '09:00', end: '10:30' }, { day: 2, start: '10:00', end: '11:00' }], 30)), 'overlapping windows rejected');
ok(validateWindows([{ day: 2, start: '09:00', end: '10:00' }, { day: 3, start: '09:00', end: '10:00' }], 30) === null, 'same hours on different days are fine');
ok(/up to/.test(validateWindows(Array.from({ length: RULES.maxWindows + 1 }, (_, i) => ({ day: i % 7, start: `0${i % 5}:00`, end: `0${i % 5}:30` })), 30)), 'window count is capped');

/* ─────────────── core: slot generation ─────────────── */
let g = generateSlots([{ day: 4, start: '18:00', end: '19:00' }], 30, NOW);
ok(g.length === 4, 'Thursday 18:00–19:00 → 2 slots × 2 Thursdays in 14 days', g.length);
ok(new Date(g[0].startsAt).getHours() === 18 && new Date(g[0].startsAt).getDate() === 12, 'first slot is today 18:00');
ok(new Date(g[2].startsAt).getDate() === 19, 'next Thursday follows');
ok(g.every((s) => new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() === 30 * 60000), 'every slot is 30 minutes');
ok(g.every((s, i) => i === 0 || s.startsAt > g[i - 1].startsAt), 'slots are in time order');
ok(generateSlots([{ day: 4, start: '18:00', end: '20:00' }], 15, NOW).length === 16, '15-min slots: 8 per 2h window × 2 Thursdays');
ok(generateSlots([{ day: 4, start: '18:00', end: '18:50' }], 30, NOW).length === 2, 'a leftover 20 minutes is not offered');
const late = generateSlots([{ day: 4, start: '18:00', end: '19:00' }], 30, new Date(2026, 10, 12, 17, 30));
ok(late.length === 3 && new Date(late[0].startsAt).getMinutes() === 30, 'slots within the 60-minute publish lead are skipped; the one exactly at the limit stays', late.map((s) => s.startsAt));
ok(generateSlots([{ day: 4, start: '18:00', end: '19:00' }], 30, new Date(2026, 10, 12, 18, 59)).length === 2, 'after today’s window only next week remains');
ok(generateSlots([{ day: 4, start: '18:00', end: '19:00' }], 30, NOW, 1).length === 2 && generateSlots([{ day: 5, start: '18:00', end: '19:00' }], 30, NOW, 1).length === 0, 'daysAhead limits the horizon');
const clockChange = generateSlots([{ day: 0, start: '09:00', end: '09:30' }], 30, new Date(2026, 2, 25, 8, 0), 14); // spans EU/US DST changes
ok(clockChange.every((s) => new Date(s.startsAt).getHours() === 9), 'local wall-clock time is kept across daylight-saving changes');
ok(slotId('u_a', '2026-11-12T12:30:00.000Z') === slotId('u_a', '2026-11-12T12:30:00.000Z') && slotId('u_a', '2026-11-12T12:30:00.000Z') !== slotId('u_a', '2026-11-12T13:00:00.000Z') && slotId('u_a', '2026-11-12T12:30:00.000Z') !== slotId('u_b', '2026-11-12T12:30:00.000Z'), 'slot ids are stable per tutor+time');
ok(overlaps({ startsAt: '2026-01-01T10:00:00Z', endsAt: '2026-01-01T10:30:00Z' }, { startsAt: '2026-01-01T10:15:00Z', endsAt: '2026-01-01T10:45:00Z' }) && !overlaps({ startsAt: '2026-01-01T10:00:00Z', endsAt: '2026-01-01T10:30:00Z' }, { startsAt: '2026-01-01T10:30:00Z', endsAt: '2026-01-01T11:00:00Z' }), 'overlap is exclusive at the boundary');

/* ─────────────── core: call window, cancel, calendar ─────────────── */
const S = '2026-11-12T12:30:00.000Z', E = '2026-11-12T13:00:00.000Z';
ok(callWindow(S, E, new Date('2026-11-12T12:19:59Z')) === 'too_early', '10m01s before → too early');
ok(callWindow(S, E, new Date('2026-11-12T12:20:00Z')) === 'open', 'opens exactly 10 minutes before');
ok(callWindow(S, E, new Date('2026-11-12T13:10:00Z')) === 'open', 'open until 10 minutes after the end');
ok(callWindow(S, E, new Date('2026-11-12T13:10:01Z')) === 'ended', 'then ended');
ok(studentCanCancel(S, new Date('2026-11-12T10:30:00Z')) && !studentCanCancel(S, new Date('2026-11-12T10:30:01Z')), 'student cancel cut-off is exactly 2 hours');
ok(minutesUntil(S, new Date('2026-11-12T12:00:00Z')) === 30, 'minutesUntil');
const ev = { id: 'x1', title: 'Mentoring: Resume review & CV? with Meera', startsAt: S, endsAt: E, description: 'Join: https://x.test/a?b=1', location: 'https://x.test/a' };
const gu = googleCalendarUrl(ev);
ok(gu.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), 'google url base');
ok(gu.includes('dates=20261112T123000Z%2F20261112T130000Z'), 'google url dates in UTC', gu);
ok(new URL(gu).searchParams.get('text') === ev.title && new URL(gu).searchParams.get('location') === ev.location, 'google url round-trips text with & and ?');
const ics = mentorIcs(ev, new Date('2026-11-01T00:00:00Z'));
ok(ics.includes('BEGIN:VEVENT') && ics.includes('DTSTART:20261112T123000Z') && ics.includes('DTEND:20261112T130000Z') && ics.includes('SUMMARY:Mentoring: Resume review & CV? with Meera') && ics.includes('TRIGGER:-PT15M'), 'ics has start, end, summary and a 15-minute reminder');
ok(topicLabel('resume') === 'Resume review' && topicLabel('nope') === 'Mentoring session', 'topic labels');

/* ─────────────── API ─────────────── */
const reset = () => {
  db.mentorConfigs = []; db.mentorSlots = []; db.mentorBookings = []; db.calendarLinks = [];
  db.notifications = db.notifications.filter((n) => !/mentoring/i.test(n.title));
};
// a second enrolled learner and an outsider (no enrolments) for the eligibility rules
const enr = db.enrollments.find((e) => e.userId === STUDENT);
db.enrollments.push({ ...enr, userId: STUDENT2 });
db.users.push({ id: STUDENT2, name: 'Second Student', email: 'stu2@demo.in', phone: '+910000000002', phoneVerified: true, password: 'x', createdAt: NOW.toISOString() });
db.users.push({ id: OUTSIDER, name: 'Outside Person', email: 'out@demo.in', phone: '+910000000003', phoneVerified: true, password: 'x', createdAt: NOW.toISOString() });
const publish = (u = TUTOR, over: any = {}) => mentorship.publish(u, { slotMins: 30, windows: WIN, topics: ALL_TOPICS, ...over }, NOW);
const openSlots = (t = TUTOR) => db.mentorSlots.filter((s) => s.tutorId === t && s.status === 'open');
const firstSlot = (t = TUTOR) => mentorship.slots(STUDENT, t, NOW).slots[0];

/* ── publishing ── */
reset();
err(() => mentorship.publish(OUTSIDER, { slotMins: 30, windows: WIN, topics: ALL_TOPICS }, NOW), 'forbidden', 'only educators can publish');
err(() => mentorship.publish(STUDENT, { slotMins: 30, windows: WIN, topics: ALL_TOPICS }, NOW), 'forbidden', 'students cannot publish');
err(() => publish(TUTOR, { windows: [] }), 'invalid', 'empty windows rejected');
err(() => publish(TUTOR, { slotMins: 25 }), 'invalid', 'bad slot length rejected');
err(() => publish(TUTOR, { topics: [] }), 'invalid', 'no topics rejected');
err(() => publish(TUTOR, { topics: ['astrology'] }), 'invalid', 'unknown topics rejected');
ok(db.mentorSlots.length === 0 && db.mentorConfigs.length === 0, 'failed publishes leave nothing behind');

const expected = generateSlots(WIN, 30, NOW).length;
let p1 = publish();
ok(p1.created === expected && openSlots().length === expected && p1.kept === 0, 'publish creates exactly the generated slots', { p1, expected });
ok(mentorship.config(TUTOR).slotMins === 30 && mentorship.config(TUTOR).topics.length === 4, 'config saved');
const ids1 = openSlots().map((s) => s.id).sort();
publish();
ok(JSON.stringify(openSlots().map((s) => s.id).sort()) === JSON.stringify(ids1) && new Set(ids1).size === ids1.length, 're-publishing is idempotent (no duplicates, same ids)');
publish(TUTOR, { windows: [{ day: 4, start: '18:00', end: '19:00' }] });
ok(openSlots().length === 4 && openSlots().every((s) => new Date(s.startsAt).getDay() === 4), 'changing the schedule replaces the old open slots');
publish(TUTOR, { slotMins: 15, windows: [{ day: 4, start: '18:00', end: '19:00' }] });
ok(openSlots().length === 8, 'switching to 15-minute slots doubles them');
ok(db.mentorSlots.filter((s) => s.tutorId === TUTOR2).length === 0, 'one tutor’s publish never touches another’s');

/* ── discovery ── */
reset(); publish();
let ml = mentorship.mentors(STUDENT, NOW);
ok(ml.length === 1 && ml[0].tutorId === TUTOR && ml[0].openSlots === expected && ml[0].slotMins === 30, 'enrolled learner sees the tutor who published', ml);
ok(mentorship.mentors(OUTSIDER, NOW).length === 0, 'a learner outside the academy sees no mentors');
ok(!mentorship.mentors(STUDENT, NOW).some((m) => m.tutorId === TUTOR2), 'tutors who have not published are not listed');
publish(TUTOR2, { windows: [{ day: 4, start: '18:00', end: '19:00' }] });
ml = mentorship.mentors(STUDENT, NOW);
ok(ml.length === 2 && ml[0].openSlots >= ml[1].openSlots, 'two mentors, most availability first');
ok(!mentorship.mentors(TUTOR, NOW).some((m) => m.tutorId === TUTOR), 'a tutor never sees themselves as a mentor');
err(() => mentorship.slots(OUTSIDER, TUTOR, NOW), 'not_enrolled', 'outsider cannot read slots');
const near = { id: 'ms_near', tutorId: TUTOR, startsAt: mins(NOW, 10).toISOString(), endsAt: mins(NOW, 40).toISOString(), status: 'open' as const };
db.mentorSlots.push(near);
ok(!mentorship.slots(STUDENT, TUTOR, NOW).slots.some((s) => s.id === 'ms_near'), 'a slot starting in 10 minutes is not offered');
db.mentorSlots = db.mentorSlots.filter((s) => s.id !== 'ms_near');

/* ── booking ── */
reset(); publish();
const slot1 = firstSlot();
err(() => mentorship.book(STUDENT, 'nope', { topic: 'resume' }, NOW), 'not_found', 'unknown slot');
err(() => mentorship.book(TUTOR, slot1.id, { topic: 'resume' }, NOW), 'self', 'tutor cannot book own slot');
err(() => mentorship.book(OUTSIDER, slot1.id, { topic: 'resume' }, NOW), 'not_enrolled', 'outsider cannot book');
err(() => mentorship.book(STUDENT, slot1.id, { topic: 'astrology' }, NOW), 'topic', 'unknown topic');
err(() => mentorship.book(STUDENT, slot1.id, { topic: '' }, NOW), 'topic', 'missing topic');
err(() => mentorship.book(STUDENT, slot1.id, { topic: 'resume', note: 'x'.repeat(RULES.noteMax + 1) }, NOW), 'invalid', 'note too long');
db.mentorSlots.push({ ...near });
err(() => mentorship.book(STUDENT, 'ms_near', { topic: 'resume' }, NOW), 'too_late', 'inside the 30-minute lead');
db.mentorSlots = db.mentorSlots.filter((s) => s.id !== 'ms_near');
ok(db.mentorBookings.length === 0 && db.mentorSlots.find((s) => s.id === slot1.id).status === 'open', 'rejected bookings leave the slot open and create nothing');
ok(!db.notifications.some((n) => /mentoring/i.test(n.title)), 'rejected bookings notify nobody');

publish(TUTOR, { topics: ['resume'] });
const slotR = firstSlot();
err(() => mentorship.book(STUDENT, slotR.id, { topic: 'debugging' }, NOW), 'topic', 'topic not offered by this mentor');
publish(TUTOR);
const sl = firstSlot();
const b1 = mentorship.book(STUDENT, sl.id, { topic: 'debugging', note: '  My loop never ends  ' }, NOW);
ok(b1.status === 'booked' && b1.topic === 'debugging' && b1.note === 'My loop never ends' && b1.startsAt === sl.startsAt && b1.endsAt === sl.endsAt, 'booking stores topic, trimmed note and times', b1);
ok(b1.topicLabel === 'Code debugging' && b1.withName === 'Meera Iyer' && b1.studentName === 'Arjun Kumar', 'view has names and label', { w: b1.withName, s: b1.studentName });
ok(db.mentorSlots.find((s) => s.id === sl.id).status === 'booked' && db.mentorSlots.find((s) => s.id === sl.id).bookingId === b1.id, 'slot marked booked and linked');
ok(!mentorship.slots(STUDENT, TUTOR, NOW).slots.some((s) => s.id === sl.id), 'booked slot disappears from the open list');
ok(db.notifications.filter((n) => /mentoring/i.test(n.title)).length === 2 && db.notifications.some((n) => n.userId === TUTOR && /New mentoring booking/.test(n.title) && n.link?.pathname === '/edu/mentorship') && db.notifications.some((n) => n.userId === STUDENT && /session booked/.test(n.title)), 'both people are notified');
err(() => mentorship.book(STUDENT2, sl.id, { topic: 'resume' }, NOW), 'taken', 'second learner cannot take the same slot');
err(() => mentorship.book(STUDENT, sl.id, { topic: 'resume' }, NOW), 'taken', 'same learner cannot book it twice');
ok(db.mentorBookings.length === 1, 'exactly one booking exists after the double-booking attempts');
ok(b1.note !== undefined && b1.cal && Object.keys(b1.cal).length === 0, 'no calendar entries when nobody is connected');

// limit + clash
reset(); publish(); publish(TUTOR2);
const open1 = mentorship.slots(STUDENT, TUTOR, NOW).slots, open2 = mentorship.slots(STUDENT, TUTOR2, NOW).slots;
const sameTime = open2.find((s) => open1.some((o) => o.startsAt === s.startsAt));
mentorship.book(STUDENT, open1[0].id, { topic: 'resume' }, NOW);
if (sameTime) err(() => mentorship.book(STUDENT, open2.find((s) => s.startsAt === open1[0].startsAt).id, { topic: 'resume' }, NOW), 'clash', 'cannot hold two sessions at the same time with different mentors');
mentorship.book(STUDENT, open1[1].id, { topic: 'project' }, NOW);
mentorship.book(STUDENT, open1[2].id, { topic: 'other' }, NOW);
err(() => mentorship.book(STUDENT, open1[3].id, { topic: 'resume' }, NOW), 'limit', `max ${RULES.maxUpcomingPerStudent} upcoming sessions per learner`);
ok(db.mentorBookings.filter((b) => b.studentId === STUDENT).length === 3 && db.mentorSlots.find((s) => s.id === open1[3].id).status === 'open', 'the refused 4th booking left its slot open');
mentorship.book(STUDENT2, open1[3].id, { topic: 'resume' }, NOW);
ok(db.mentorBookings.length === 4, 'another learner is not affected by the first learner’s limit');

/* ── my sessions / tutor overview ── */
let mine = mentorship.mine(STUDENT, NOW);
ok(mine.upcoming.length === 3 && mine.upcoming.every((b, i) => i === 0 || b.startsAt >= mine.upcoming[i - 1].startsAt) && mine.past.length === 0, 'my sessions: upcoming soonest first', mine.upcoming.map((b) => b.startsAt));
let ov = mentorship.overview(TUTOR, NOW);
ok(ov.published && ov.upcoming.length === 4 && ov.openSlots === openSlots().length && ov.upcoming[0].studentName.length > 0, 'tutor overview counts upcoming and open slots', { up: ov.upcoming.length, open: ov.openSlots });
ok(mentorship.overview(TUTOR2, NOW).upcoming.length === 0 && !mentorship.overview(OUTSIDER, NOW).published, 'overview is per tutor');
ok(ov.upcoming.every((b) => b.canCancel && !b.canComplete), 'future sessions can be cancelled but not completed yet');

/* ── cancellation ── */
reset(); publish();
const cs = firstSlot();
const cb = mentorship.book(STUDENT, cs.id, { topic: 'resume' }, NOW);
err(() => mentorship.cancel(OUTSIDER, cb.id, NOW), 'not_found', 'only participants can cancel');
err(() => mentorship.cancel(STUDENT2, cb.id, NOW), 'not_found', 'other learners cannot cancel it');
err(() => mentorship.cancel(STUDENT, 'nope', NOW), 'not_found', 'unknown booking');
const tooLate = mins(new Date(cb.startsAt), -90); // 90 min before the start
err(() => mentorship.cancel(STUDENT, cb.id, tooLate), 'too_late', 'learner cannot cancel inside 2 hours');
ok(db.mentorBookings.find((b) => b.id === cb.id).status === 'booked' && db.mentorSlots.find((s) => s.id === cs.id).status === 'booked', 'a refused cancellation changes nothing');
const c1 = mentorship.cancel(STUDENT, cb.id, NOW);
ok(c1.status === 'cancelled' && c1.cancelledBy === 'student', 'learner cancels with notice');
ok(db.mentorSlots.find((s) => s.id === cs.id).status === 'open' && !db.mentorSlots.find((s) => s.id === cs.id).bookingId, 'the slot reopens');
ok(db.notifications.some((n) => n.userId === TUTOR && /cancelled/i.test(n.title)), 'tutor is told');
err(() => mentorship.cancel(STUDENT, cb.id, NOW), 'state', 'cannot cancel twice');
const rebook = mentorship.book(STUDENT2, cs.id, { topic: 'resume' }, NOW);
ok(rebook.status === 'booked', 'someone else can take the reopened slot');
const tc = mentorship.cancel(TUTOR, rebook.id, tooLate);
ok(tc.status === 'cancelled' && tc.cancelledBy === 'tutor', 'a tutor can cancel at short notice');
ok(!db.mentorSlots.some((s) => s.id === cs.id), 'a tutor-cancelled slot is withdrawn, not reopened');
ok(db.notifications.some((n) => n.userId === STUDENT2 && /cancelled/i.test(n.title) && n.link?.pathname === '/mentors'), 'the learner is told');
mine = mentorship.mine(STUDENT, NOW);
ok(mine.upcoming.length === 0 && mine.past.length === 1 && mine.past[0].status === 'cancelled', 'cancelled sessions move to history');
const afterEnd = mins(new Date(cs.endsAt), 5);
const eb = mentorship.book(STUDENT, firstSlot().id, { topic: 'resume' }, NOW);
err(() => mentorship.cancel(TUTOR, eb.id, mins(new Date(eb.endsAt), 1)), 'ended', 'cannot cancel after it ended');

/* ── completion ── */
reset(); publish();
const ks = firstSlot();
const kb = mentorship.book(STUDENT, ks.id, { topic: 'project' }, NOW);
err(() => mentorship.complete(STUDENT, kb.id, '', mins(new Date(kb.startsAt), 5)), 'not_found', 'learners cannot complete');
err(() => mentorship.complete(TUTOR, kb.id, '', NOW), 'too_early', 'cannot complete before it starts');
err(() => mentorship.complete(TUTOR, kb.id, 'x'.repeat(RULES.tutorNoteMax + 1), mins(new Date(kb.startsAt), 5)), 'invalid', 'feedback too long');
ok(mentorship.overview(TUTOR, mins(new Date(kb.startsAt), 5)).upcoming[0].canComplete, 'canComplete turns on once it starts');
const done = mentorship.complete(TUTOR, kb.id, '  Great structure, add tests.  ', mins(new Date(kb.startsAt), 35));
ok(done.status === 'completed' && done.tutorNote === 'Great structure, add tests.', 'completed with a trimmed note');
ok(db.notifications.some((n) => n.userId === STUDENT && /completed/i.test(n.title)), 'learner is told');
err(() => mentorship.complete(TUTOR, kb.id, '', mins(new Date(kb.startsAt), 40)), 'state', 'cannot complete twice');
err(() => mentorship.cancel(STUDENT, kb.id, NOW), 'state', 'a completed session cannot be cancelled');
ok(mentorship.overview(TUTOR, mins(new Date(kb.startsAt), 60)).stats.completed === 1, 'stats count completed sessions');
ok(mentorship.mine(STUDENT, mins(new Date(kb.startsAt), 60)).past[0].tutorNote === 'Great structure, add tests.', 'learner can read the feedback');

/* ── joining the call ── */
reset(); publish();
const js = firstSlot();
const jb = mentorship.book(STUDENT, js.id, { topic: 'debugging', note: 'help' }, NOW);
const startT = new Date(jb.startsAt);
err(() => mentorship.join(STUDENT, jb.id, mins(startT, -11)), 'too_early', 'room closed 11 minutes before');
const jt = mentorship.join(STUDENT, jb.id, mins(startT, -10));
ok(jt.role === 'student' && jt.room === `mentor-${jb.id}` && jt.peerName === 'Meera Iyer' && jt.topic === 'Code debugging' && jt.note === 'help' && jt.token.length > 5, 'learner joins as student with room, peer and topic', jt);
const jh = mentorship.join(TUTOR, jb.id, mins(startT, 5));
ok(jh.role === 'host' && jh.room === jt.room && jh.peerName === 'Arjun Kumar' && jh.token !== jt.token, 'tutor joins the same room as host with their own token');
err(() => mentorship.join(OUTSIDER, jb.id, mins(startT, 5)), 'not_found', 'outsiders cannot join');
err(() => mentorship.join(STUDENT2, jb.id, mins(startT, 5)), 'not_found', 'other learners cannot join');
ok(mentorship.join(STUDENT, jb.id, mins(new Date(jb.endsAt), 10)).role === 'student', 'still joinable until 10 minutes after the end');
err(() => mentorship.join(STUDENT, jb.id, mins(new Date(jb.endsAt), 11)), 'ended', 'ended afterwards');
mentorship.cancel(TUTOR, jb.id, NOW);
err(() => mentorship.join(STUDENT, jb.id, mins(startT, 1)), 'cancelled', 'cancelled sessions cannot be joined');

/* ── calendar sync ── */
reset(); publish();
const q1 = mentorship.book(STUDENT, firstSlot().id, { topic: 'resume' }, NOW);
ok(!mentorCalendar.status(STUDENT).connected && mentorCalendar.status(STUDENT).account === null, 'starts disconnected');
let ef = mentorCalendar.eventFor(q1.id, STUDENT, NOW);
ok(!ef.synced && ef.googleUrl.startsWith('https://calendar.google.com/') && /Mentoring: Resume review with Meera Iyer/.test(ef.event.title) && ef.ics.includes('BEGIN:VEVENT'), 'manual add-to-calendar still works while disconnected', ef.event.title);
ok(/Mentoring: Resume review with Arjun Kumar/.test(mentorCalendar.eventFor(q1.id, TUTOR, NOW).event.title), 'each person sees the other’s name in their event');
ok(mentorCalendar.eventFor(q1.id, STUDENT, NOW).event.location.includes(`/mentor-call/${q1.id}`), 'event carries the call link');
err(() => mentorCalendar.eventFor(q1.id, OUTSIDER, NOW), 'not_found', 'outsiders cannot read the event');
const st = mentorCalendar.connect(STUDENT, NOW);
ok(st.connected && st.account === 'arjun@demo.in' && db.calendarLinks.length === 1, 'connect records the account');
mentorCalendar.connect(STUDENT, NOW);
ok(db.calendarLinks.length === 1, 'connecting twice keeps a single link');
ok(mentorCalendar.eventFor(q1.id, STUDENT, NOW).synced && !mentorCalendar.eventFor(q1.id, TUTOR, NOW).synced, 'connecting back-fills the learner’s existing booking only');
mentorCalendar.connect(TUTOR, NOW);
const q2 = mentorship.book(STUDENT, mentorship.slots(STUDENT, TUTOR, NOW).slots[1].id, { topic: 'project' }, NOW);
ok(mentorCalendar.eventFor(q2.id, STUDENT, NOW).synced && mentorCalendar.eventFor(q2.id, TUTOR, NOW).synced, 'new bookings sync for everyone who is connected');
ok(mentorship.mine(STUDENT, NOW).upcoming.every((b) => b.synced) && mentorship.overview(TUTOR, NOW).upcoming.find((b) => b.id === q2.id).synced, 'views report the sync state');
ok(mentorship.mine(STUDENT, NOW).calendar.connected && mentorship.overview(TUTOR, NOW).calendar.connected, 'views include calendar status');
mentorship.cancel(STUDENT, q2.id, NOW);
ok(!mentorCalendar.eventFor(q2.id, STUDENT, NOW).synced && !mentorCalendar.eventFor(q2.id, TUTOR, NOW).synced, 'cancelling removes both calendar entries');
mentorCalendar.disconnect(STUDENT);
ok(!mentorCalendar.status(STUDENT).connected && !mentorCalendar.eventFor(q1.id, STUDENT, NOW).synced && mentorCalendar.eventFor(q1.id, TUTOR, NOW).synced, 'disconnecting removes only that person’s entries');
const q3 = mentorship.book(STUDENT, mentorship.slots(STUDENT, TUTOR, NOW).slots[2].id, { topic: 'other' }, NOW);
ok(!mentorCalendar.eventFor(q3.id, STUDENT, NOW).synced && mentorCalendar.eventFor(q3.id, TUTOR, NOW).synced, 'after disconnecting, only the still-connected tutor syncs');

/* ── removing slots / unpublishing ── */
reset(); publish();
const rs = firstSlot();
mentorship.removeSlot(TUTOR, rs.id);
ok(!db.mentorSlots.some((s) => s.id === rs.id) && !mentorship.slots(STUDENT, TUTOR, NOW).slots.some((s) => s.id === rs.id), 'tutor can remove an open slot');
err(() => mentorship.removeSlot(TUTOR, rs.id), 'not_found', 'removing twice');
publish(TUTOR2);
err(() => mentorship.removeSlot(TUTOR, mentorship.slots(STUDENT, TUTOR2, NOW).slots[0].id), 'not_found', 'cannot remove another tutor’s slot');
const bs = mentorship.book(STUDENT, firstSlot().id, { topic: 'resume' }, NOW);
err(() => mentorship.removeSlot(TUTOR, bs.slotId), 'booked', 'a booked slot must be cancelled, not removed');
const up = mentorship.unpublish(TUTOR, NOW);
ok(up.upcoming === 1 && !mentorship.config(TUTOR) && openSlots().length === 0 && db.mentorSlots.some((s) => s.id === bs.slotId), 'unpublish removes open slots, keeps the booked one');
ok(mentorship.mentors(STUDENT, NOW).every((m) => m.tutorId !== TUTOR) && mentorship.mine(STUDENT, NOW).upcoming.length === 1, 'tutor disappears from discovery; the existing booking stays');

/* ── re-publishing around a booking ── */
reset(); publish();
const keep = mentorship.book(STUDENT, firstSlot().id, { topic: 'resume' }, NOW);
const rp = publish(TUTOR, { windows: WIN });
ok(rp.kept === 1 && db.mentorSlots.filter((s) => s.id === keep.slotId).length === 1 && db.mentorSlots.find((s) => s.id === keep.slotId).status === 'booked', 'republishing never drops or duplicates a booked slot', rp);
publish(TUTOR, { windows: [{ day: 6, start: '09:00', end: '10:00' }] });
ok(db.mentorBookings.find((b) => b.id === keep.id).status === 'booked' && mentorship.overview(TUTOR, NOW).upcoming.length === 1, 'a booking survives the schedule being replaced');
const clashWindow = [{ day: new Date(keep.startsAt).getDay(), start: fromMin(new Date(keep.startsAt).getHours() * 60), end: fromMin(new Date(keep.startsAt).getHours() * 60 + 60) }];
publish(TUTOR, { windows: clashWindow });
ok(!openSlots().some((s) => overlaps(s, { startsAt: keep.startsAt, endsAt: keep.endsAt })), 'new slots never overlap an existing booking');

console.log(`mentorship: ${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
