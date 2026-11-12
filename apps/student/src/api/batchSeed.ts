/** Demo batches, students, sessions, attendance and announcements for Rajesh Kumar Academy. */
import { generateSessions, type Announcement, type AttendanceMark, type Batch, type ClassSession, type Person } from '@/core/batch';
import { courses } from './catalogSeed';

const NAMES = [
  'Ananya R', 'Karthik M', 'Divya S', 'Arun Kumar', 'Sneha R', 'Priya S', 'Vignesh M', 'Harini P', 'Sanjay K', 'Kavya R', 'Meena V', 'Rahul P',
  'Lakshmi N', 'Surya T', 'Nithya G', 'Ashwin B', 'Pooja D', 'Gokul R', 'Swetha K', 'Bharath S', 'Deepika M', 'Hari Prasad', 'Janani V', 'Manoj K',
  'Revathi S', 'Siddharth A', 'Yamini L', 'Prakash J', 'Aishwarya T', 'Dinesh R', 'Keerthana B', 'Naveen C', 'Sowmya P', 'Tharun K', 'Varsha N', 'Ajay S',
  'Bhavana R', 'Elango M', 'Gayathri D', 'Imran S', 'Jothi K', 'Kishore V', 'Monica A', 'Pradeep G', 'Ramya S', 'Suresh B', 'Uma M', 'Vasanth R',
  'Abinaya K', 'Balaji N', 'Charulatha S', 'Dharun P', 'Fathima Z', 'Ganesh V', 'Hema R', 'Iniyan M',
];

/** Small deterministic RNG so the demo looks the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
};
/** Date `offset` days from today, moved forward to the given weekday. */
const nextDow = (offset: number, dow: number) => {
  const d = day(offset);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export function seedBatchData() {
  const now = Date.now();
  const r = rng(42);
  const T = 't_rajesh';

  const batches: Batch[] = [
    {
      id: 'b_dm_wk', tenantId: T, courseId: 'c_dm_ai', name: 'DM & AI – Weekend Batch (Oct 2026)', code: 'DM-OCT-02', type: 'cohort', instructorIds: ['u_rajesh', 'u_meera'], capacity: 30,
      startDate: nextDow(-31, 6), endDate: nextDow(40, 0), slots: [{ day: 6, start: '16:00', end: '18:00', mode: 'online' }, { day: 0, start: '16:00', end: '18:00', mode: 'online' }],
      enrollment: { selfEnroll: true, approval: false, closesAt: day(-31).toISOString() }, createdAt: day(-45).toISOString(), status: 'published',
    },
    {
      id: 'b_meta_eve', tenantId: T, courseId: 'c_meta_ads', name: 'Meta Ads – Evening Batch (Nov 2026)', code: 'META-NOV-01', type: 'live_only', instructorIds: ['u_meera'], capacity: 25,
      startDate: nextDow(9, 2), endDate: nextDow(44, 4), slots: [{ day: 2, start: '19:00', end: '20:30', mode: 'online' }, { day: 4, start: '19:00', end: '20:30', mode: 'online' }],
      enrollment: { selfEnroll: true, approval: true, closesAt: day(8).toISOString() }, createdAt: day(-6).toISOString(), status: 'published',
    },
    {
      id: 'b_seo_sep', tenantId: T, courseId: 'c_seo_growth', name: 'SEO & Growth – Aug 2026', code: 'SEO-AUG-01', type: 'cohort', instructorIds: ['u_rajesh'], capacity: 25,
      startDate: nextDow(-95, 3), endDate: nextDow(-12, 3), slots: [{ day: 3, start: '19:00', end: '20:30', mode: 'online' }],
      enrollment: { selfEnroll: false, approval: false, closesAt: day(-95).toISOString() }, createdAt: day(-110).toISOString(), status: 'published',
    },
  ];

  const topicsFor = (courseId: string) => courses.find((c) => c.id === courseId)!.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'video').map((l) => l.title));

  const sessions: ClassSession[] = batches.flatMap((b) =>
    generateSessions(b, topicsFor(b.courseId), `s_${b.id}`).map((s) => {
      const past = new Date(s.endsAt).getTime() < now;
      return { ...s, status: past ? (s.no === 3 && b.id === 'b_seo_sep' ? 'cancelled' : 'conducted') : 'scheduled', recording: past };
    }),
  );

  // Students: 28 in the weekend batch (Arjun is a real account), 12 pending/approved for the evening batch, 20 completed SEO.
  const people: Person[] = [];
  const mk = (i: number, extra: Partial<Person> = {}): Person => {
    const name = NAMES[i % NAMES.length];
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '');
    return {
      id: `p_${i}`, tenantId: T, name, email: `${slug}@email.com`, phone: `+9198${String(40000000 + i * 7919).slice(0, 8)}`, enrollmentId: `ENR${String(156 + i).padStart(5, '0')}`,
      joinedAt: day(-40 - Math.round(r() * 60)).toISOString(), lastActiveAt: new Date(now - Math.round(r() * 6 * 864e5)).toISOString(),
      courses: [], learningMinutes: 300 + Math.round(r() * 1500), streak: Math.round(r() * 12), scores: [], notes: [], ...extra,
    };
  };
  const weekend = batches[0], evening = batches[1], seo = batches[2];
  for (let i = 0; i < 27; i++) {
    const p = mk(i);
    const prog = i === 4 ? 54 : Math.round(45 + r() * 55);
    p.courses.push({ courseId: weekend.courseId, batchId: weekend.id, progress: i === 3 ? 100 : prog, enrolledAt: weekend.startDate, status: i === 3 ? 'completed' : i === 4 ? 'on_hold' : 'active' });
    p.scores = [{ title: 'Module 1 Quiz', pct: 60 + Math.round(r() * 40) }, { title: 'SEO Fundamentals – Quiz 1', pct: i % 5 === 0 ? null : 55 + Math.round(r() * 45) }];
    if (i < 8) p.courses.push({ courseId: seo.courseId, batchId: seo.id, progress: 100, enrolledAt: seo.startDate, status: 'completed' });
    people.push(p);
  }
  people.push({
    id: 'p_arjun', tenantId: T, userId: 'u_arjun', name: 'Arjun Kumar', email: 'arjun@demo.in', phone: '+919876543210', enrollmentId: 'ENR00412', joinedAt: '2026-06-05T10:24:00+05:30',
    lastActiveAt: new Date(now - 2 * 36e5).toISOString(), courses: [{ courseId: weekend.courseId, batchId: weekend.id, progress: 0, enrolledAt: weekend.startDate, status: 'active' }],
    learningMinutes: 1104, streak: 6, scores: [], notes: [{ id: 'n_a1', text: 'Asked good questions on keyword clustering. Interested in freelancing.', at: day(-5).toISOString(), by: 'Rajesh Kumar' }],
  });
  for (let i = 27; i < 39; i++) {
    const p = mk(i);
    p.courses.push({ courseId: evening.courseId, batchId: evening.id, progress: 0, enrolledAt: day(-Math.round(r() * 5)).toISOString(), status: i >= 36 ? 'pending' : 'active' });
    people.push(p);
  }
  for (let i = 39; i < 51; i++) {
    const p = mk(i, { lastActiveAt: day(-20 - Math.round(r() * 20)).toISOString() });
    p.courses.push({ courseId: seo.courseId, batchId: seo.id, progress: i % 4 === 0 ? 62 : 100, enrolledAt: seo.startDate, status: i % 4 === 0 ? 'active' : 'completed' });
    people.push(p);
  }
  // a few self-paced learners with no batch
  for (let i = 51; i < 56; i++) {
    const p = mk(i);
    p.courses.push({ courseId: 'c_ga4', progress: Math.round(r() * 100), enrolledAt: day(-Math.round(r() * 30)).toISOString(), status: 'active' });
    people.push(p);
  }

  // Attendance for conducted sessions. Two learners are deliberately low (follow-up demo).
  const attendance: AttendanceMark[] = [];
  for (const s of sessions.filter((x) => x.status === 'conducted')) {
    const members = people.filter((p) => p.courses.some((c) => c.batchId === s.batchId && c.status !== 'pending'));
    for (const p of members) {
      const low = p.id === 'p_4' || p.id === 'p_11';
      const x = r();
      const status = low ? (x < 0.33 ? 'absent' : x < 0.42 ? 'late' : 'present') : x < 0.05 ? 'absent' : x < 0.1 ? 'late' : 'present';
      attendance.push({ sessionId: s.id, personId: p.id, status, note: status === 'late' ? `Joined ${5 + Math.round(r() * 20)} min late` : undefined });
    }
  }

  const ago = (h: number) => new Date(now - h * 36e5).toISOString();
  const nextWeekend = sessions.find((s) => s.batchId === weekend.id && s.status === 'scheduled');
  const announcements: Announcement[] = [
    { id: 'an1', tenantId: T, batchId: weekend.id, title: `This ${nextWeekend ? new Date(nextWeekend.startsAt).toLocaleDateString('en-IN', { weekday: 'long' }) : 'weekend'}’s live class`, body: `Next class: ${nextWeekend?.topic ?? 'SEO & Content Strategy'}. Please watch the pre-reading lesson before joining.`, kind: 'class', pinned: true, status: 'sent', createdAt: ago(2), audience: 'batch', reached: 28, by: 'Rajesh Kumar' },
    { id: 'an2', tenantId: T, batchId: weekend.id, title: 'Keyword Research Project – reminder', body: 'The Keyword Research Project is due in 4 days. Submit a PDF or a shareable Google Doc link.', kind: 'assignment', pinned: false, status: 'sent', createdAt: ago(26), audience: 'batch', reached: 28, by: 'Meera Iyer' },
    { id: 'an3', tenantId: T, batchId: weekend.id, title: 'Recording available', body: 'Last class recording is now in the Live tab under Past & Attendance.', kind: 'recording', pinned: false, status: 'sent', createdAt: ago(50), audience: 'batch', reached: 28, by: 'Rajesh Kumar' },
    { id: 'an4', tenantId: T, batchId: weekend.id, title: 'Group project teams', body: 'Teams for the capstone will be shared after Module 4. Start thinking about a business you want to market.', kind: 'general', pinned: false, status: 'scheduled', createdAt: ago(1), sendAt: new Date(now + 2 * 864e5).toISOString(), audience: 'batch', reached: 0, by: 'Rajesh Kumar' },
  ];

  return { batches, sessions, people, attendance, announcements };
}
