/**
 * In-memory mock database for the POC. Shape mirrors the future real schema.
 * Persisted to localStorage on web so a refresh keeps the demo state.
 * DEVELOPER: delete this file once src/api/client.ts points at the real backend.
 */
import type { MentorBooking, MentorConfig, MentorSlot } from '@/core/mentorship';
import type { Coupon, EducatorApplication, Invoice, Membership, TeamInvite, Tenant, User } from '@/core/types';
import type { Course, Enrollment, Order, Review, Tutor } from '@/core/catalog';
import { courses } from './catalogSeed';
import { ASSESSMENTS, QUESTIONS } from './assessSeed';
import { seedBatchData } from './batchSeed';
import { seedPlatform, type PlatformReport, type RefundRequest, type TenantExtra } from './adminSeed';
import type { AuditEntry } from '@/core/admin';
import type { Announcement, AttendanceMark, Batch, ClassSession, LiveSummary, Person } from '@/core/batch';
import { score, type Assessment, type Attempt, type Question, type Submission } from '@/core/assess';
import { DEFAULT_PLATFORM_CONFIG, payoutDateFor, paymentRoute, splitOrder, type PlatformConfig, type UsageSnapshot } from '@/core/business';

interface Db {
  users: (User & { password: string })[];
  memberships: Membership[];
  applications: EducatorApplication[];
  tenants: Tenant[];
  enrollments: Enrollment[];
  wishlist: { userId: string; courseId: string }[];
  recentSearches: Record<string, string[]>;
  reviews: Review[];
  orders: Order[];
  liveRegistrations: { userId: string; sessionId: string }[];
  positions: Record<string, number>; // `${userId}:${lessonId}` → seconds watched
  notes: { id: string; userId: string; courseId: string; lessonId: string; atSec: number; text: string; createdAt: string }[];
  questions: { id: string; courseId: string; lessonId: string; userId: string; userName: string; text: string; createdAt: string; personId?: string; answer?: { by: string; text: string; at: string } }[];
  downloads: { userId: string; courseId: string; lessonId: string; sizeMb: number; quality: 'sd' | 'hd'; savedAt: string }[];
  bookmarks: { userId: string; lessonId: string }[];
  attendance: { userId: string; sessionId: string; minutes: number; joinedAt: string }[];
  calendarSync: Record<string, boolean>;
  playgroundProjects: { id: string; userId: string; stack: string; title: string; files: { name: string; lang: string; code: string }[]; updatedAt: string }[];
  playgroundSolved: { userId: string; challengeId: string; at: string }[];
  /**
   * Code Arena activity, at most one record per kind per learner per day. The streak counts a day if it has any.
   * kind 'code' = passed that day's Daily Challenge; 'quiz' = answered the Daily Concept Quiz.
   * `xp` is the EXTRA XP this activity earned (quiz points + streak bonus); challenge points come from playgroundSolved.
   * Records saved before kinds existed have neither field, so they count as kind 'code' with xp 0.
   */
  playgroundDaily: { userId: string; day: string; challengeId: string; kind?: 'code' | 'quiz'; xp?: number; correct?: boolean; choice?: number }[];
  /** 1-on-1 mentorship: a tutor's published weekly windows, the bookable slots made from them, and bookings. */
  mentorConfigs: MentorConfig[];
  mentorSlots: MentorSlot[];
  mentorBookings: MentorBooking[];
  /** Users who connected Google Calendar (preview: simulated consent; real: OAuth refresh token kept server-side). */
  calendarLinks: { userId: string; account: string; connectedAt: string }[];
  playgroundUsage: Record<string, number>; // `${userId}:${yyyy-mm-dd}` → server runs used
  attempts: Attempt[];
  submissions: Submission[];
  assessments: Assessment[]; // educator-created / edited (overlay on the seed list)
  customQuestions: Question[];
  coupons: Coupon[];
  invoices: Invoice[];
  invites: TeamInvite[];
  certificates: { id: string; userId: string; courseId?: string; title: string; program: string; issuedAt: string; weeks: number; tutor: string; template?: import('@/core/certification').CertTemplate }[];
  /** Certificate requests raised automatically when a learner reaches 75% + passes the course quizzes; the course creator approves. */
  certRequests: import('@/core/certification').CertRequest[];
  /** Custom certificate templates per workspace (keyed by tenantId). */
  certTemplates: Record<string, import('@/core/certification').CertTemplate>;
  tickets: { id: string; userId: string; category: string; subject: string; body: string; status: 'open' | 'in_progress' | 'resolved'; createdAt: string; replies: { by: string; text: string; at: string }[] }[];
  notifications: { id: string; userId: string; kind: 'live' | 'grade' | 'course' | 'payment' | 'qa' | 'system'; title: string; body: string; at: string; read: boolean; link?: { pathname: string; params?: Record<string, string> } }[];
  settings: Record<string, { push: Record<'live' | 'assignments' | 'course' | 'offers', boolean>; wifiOnly: boolean; quality: 'auto' | 'sd' | 'hd'; language: 'en' | 'ta' }>;
  feedback: { userId: string; rating: number; text: string; at: string }[];
  platformConfig: PlatformConfig;
  /** Measured usage per tenant (real: computed from usage events). */
  usage: Record<string, UsageSnapshot>;
  /** Demo aggregates for big numbers the small seed cannot produce (real: computed by the API). */
  tenantStats: Record<string, TenantExtra>;
  reports: PlatformReport[];
  refundRequests: RefundRequest[];
  audit: AuditEntry[];
  platformHistory: { gmv: number[]; bodhin: number[] };
  adminVerified: Record<string, string>;
  tenantNotes: { id: string; tenantId: string; text: string; by: string; at: string }[];
  /** Super Admin edits to the plan catalogue (applied over core/plans.ts + PLAN_FEATURES + ADDON_CATALOG at load). */
  catalog: { plans: Record<string, Partial<import('@/core/plans').Plan>>; features: Record<string, string[]>; addonPrices: Record<string, number> };
  payoutRuns: { id: string; date: string; status: 'approved' | 'paid'; lines: { tenantId: string; name: string; amount: number; orders: number; bank: string; utr?: string; orderIds?: string[] }[]; approvedBy: string; approvedAt: string; paidAt?: string }[];
  payoutHolds: Record<string, { reason: string; by: string; at: string }>;
  curation: { featured: string[]; banners: string[]; categories: (import('@/core/catalog').Category & { hidden?: boolean })[] | null };
  userLocks: Record<string, { reason: string; by: string; at: string }>;
  broadcasts: { id: string; at: string; by: string; audience: string; title: string; body: string; reached: number }[];
  flags: { tutorSignups: boolean; marketplaceCheckout: boolean; liveClasses: boolean; maintenance: { on: boolean; message: string } };
  configHistory: { id: string; at: string; by: string; area: 'platform' | 'plan' | 'addon'; label: string; changes: { field: string; from: string; to: string }[]; reason: string }[]; // userId → ISO time 2FA passed (POC; real: session claim)
  tutorAssignments: { userId: string; courseId: string }[];
  /** Courses created or edited by educators (overlay on the demo catalogue). */
  courses: Course[];
  /** Instructor profiles created on educator approval (overlay on the demo tutors). */
  tutorProfiles: Tutor[];
  batches: Batch[];
  classSessions: ClassSession[];
  people: Person[];
  batchAttendance: AttendanceMark[];
  announcements: Announcement[];
  sessionSummaries: Record<string, LiveSummary>;
  /** Status overrides for course-level live sessions (batch sessions store status on the row). */
  sessionStatus: Record<string, 'conducted' | 'cancelled'>;
  activity: { id: string; tenantId: string; kind: 'enroll' | 'live' | 'submission' | 'certificate' | 'review' | 'payout'; text: string; at: string; link?: { pathname: string; params?: Record<string, string> } }[];
}

const seed = (): Db => mergeExtras({
  users: [
    {
      id: 'u_arjun',
      name: 'Arjun Kumar',
      email: 'arjun@demo.in',
      phone: '+919876543210',
      phoneVerified: true,
      password: 'demo123',
      createdAt: '2026-01-15T10:00:00Z',
    },
    { id: 'u_rajesh', name: 'Rajesh Kumar', email: 'rajesh@demo.in', phone: '+919840012345', phoneVerified: true, password: 'demo123', createdAt: '2025-11-02T10:00:00Z' },
    { id: 'u_meera', name: 'Meera Iyer', email: 'meera@demo.in', phone: '+919841122334', phoneVerified: true, password: 'demo123', createdAt: '2026-03-10T10:00:00Z' },
  ],
  memberships: [
    { userId: 'u_arjun', tenantId: 't_bodhin', role: 'student' },
    { userId: 'u_rajesh', tenantId: 't_rajesh', role: 'owner' },
    { userId: 'u_rajesh', tenantId: 't_bodhin', role: 'student' },
    { userId: 'u_meera', tenantId: 't_rajesh', role: 'tutor' },
  ],
  applications: [],
  tenants: [
    {
      id: 't_bodhin',
      slug: 'www',
      status: 'active',
      plan: 'enterprise',
      branding: { displayName: 'Bodhin', tagline: 'Discover What You Can Become', primary: '#0B3B73', primaryDeep: '#071F44', accent: '#D99A1E' },
      // Bodhin's own academy: Bodhin's Razorpay collects, no subscription billing.
      subscription: { plan: 'enterprise', status: 'active', billing: 'annual', periodEnd: '2099-12-31T00:00:00Z', addons: [] },
      payments: { directGateway: 'razorpay', directGatewayStatus: 'active', payoutAccount: { bank: 'Bodhin current account', last4: '0001', verified: true } },
    },
    {
      id: 't_rajesh',
      slug: 'rajesh',
      customDomain: 'learn.rajeshacademy.in',
      domain: { host: 'learn.rajeshacademy.in', status: 'active', addedAt: '2026-02-03T10:00:00+05:30' },
      status: 'active',
      plan: 'institute',
      branding: { displayName: 'Rajesh Kumar Academy', tagline: 'Digital Marketing, the practical way', primary: '#0F6E5A', primaryDeep: '#073D33', accent: '#E8833A' },
      subscription: { plan: 'institute', status: 'active', billing: 'annual', periodEnd: '2027-02-01T00:00:00+05:30', addons: [] },
      payments: { directGateway: 'razorpay', directGatewayStatus: 'active', payoutAccount: { bank: 'HDFC Bank', last4: '4821', verified: true }, gstin: '33ABCDE1234F1Z5' },
      ownerUserId: 'u_rajesh',
      createdAt: '2025-11-02T10:00:00Z',
    },
  ],
  enrollments: [
    seedEnrollment('c_dm_ai', 13, '2026-06-05', 2),
    seedEnrollment('c_python_ai', 6, '2026-05-10', 30),
    seedEnrollment('c_excel', 9, '2026-04-20', 80),
  ],
  wishlist: [],
  recentSearches: { u_arjun: ['SEO', 'Python'] },
  reviews: [],
  orders: [
    { id: 'o_1', userId: 'u_arjun', courseId: 'c_dm_ai', amountInr: 17500, discountInr: 0, method: 'upi', status: 'paid', createdAt: '2026-06-05T10:24:00+05:30', invoiceNo: 'BOD-INV-2026-00412', source: 'bodhin_campaign', commissionInr: 3500, gatewayFeeInr: 350, educatorShareInr: 13650, channel: 'bodhin_marketplace', collector: 'bodhin', sellerTenantId: 't_rajesh', payoutStatus: 'paid', payoutDate: '2026-06-15T10:00:00+05:30' },
    { id: 'o_2', userId: 'u_arjun', courseId: 'c_python_ai', amountInr: 12000, discountInr: 3000, coupon: 'EARLYBIRD', method: 'card', status: 'paid', createdAt: '2026-05-10T11:02:00+05:30', invoiceNo: 'CODEPATH-2026-0118', source: 'direct', commissionInr: 0, gatewayFeeInr: 0, educatorShareInr: 12000, channel: 'tutor_direct', collector: 'educator', sellerTenantId: 't_codepath', payoutStatus: 'not_applicable' },
    ...seedTenantOrders(),
  ],
  liveRegistrations: [
    { userId: 'u_arjun', sessionId: 'ls_1' },
    { userId: 'u_arjun', sessionId: 'ls_2' },
  ],
  positions: {},
  notes: [],
  questions: [
    { id: 'q1', courseId: 'c_dm_ai', lessonId: 'dm_m1_l1', userId: 'u_x1', userName: 'Kavya R.', text: 'Is digital marketing still a good career for freshers in 2026?', createdAt: '2026-10-28T09:00:00Z', answer: { by: 'Rajesh Kumar', text: 'Yes — especially if you can show real campaigns. The capstone in Module 6 is built for your portfolio.', at: '2026-10-28T12:00:00Z' } },
    { id: 'q2', courseId: 'c_dm_ai', lessonId: 'dm_m1_l1', userId: 'u_x2', userName: 'Arun K.', text: 'Which tools do we need to install before Module 2?', createdAt: '2026-10-30T10:00:00Z' },
  ],
  downloads: [],
  bookmarks: [],
  attendance: [],
  calendarSync: {},
  playgroundProjects: [],
  playgroundSolved: [],
  playgroundDaily: [],
  mentorConfigs: [],
  mentorSlots: [],
  mentorBookings: [],
  calendarLinks: [],
  playgroundUsage: {},
  attempts: seedAttempts(),
  submissions: [
    { id: 'sub_content', userId: 'u_arjun', assessmentId: 'asg_content', status: 'submitted', files: [{ name: 'content-calendar-november.pdf', sizeMb: 2.1 }], note: 'Calendar for a Madurai bakery brand.', updatedAt: daysAgo(1.5), submittedAt: daysAgo(1.5) },
    {
      id: 'sub_final', userId: 'u_arjun', assessmentId: 'asg_final', status: 'graded', files: [{ name: 'final-campaign-deck.pdf', sizeMb: 8.4 }], note: '', updatedAt: daysAgo(6), submittedAt: daysAgo(6),
      grade: { pct: 92, by: 'Rajesh Kumar', at: daysAgo(5), feedback: 'Excellent research and a realistic budget. Your measurement plan is the strongest part. Next time, add one more creative variant for testing.', rubric: [{ item: 'Research & insight', score: 23, max: 25 }, { item: 'Channel strategy', score: 18, max: 20 }, { item: 'Creatives', score: 17, max: 20 }, { item: 'Budget & KPIs', score: 15, max: 15 }, { item: 'Measurement plan', score: 19, max: 20 }] },
    },
    { id: 'sub_meta', userId: 'u_arjun', assessmentId: 'asg_meta', status: 'draft', files: [], note: 'Brand: local organic store. Working on creatives.', updatedAt: daysAgo(0.3) },
  ],
  certificates: [
    { id: 'BODHIN-DM-AI-2026-0487', userId: 'u_arjun', title: 'Digital Marketing Fundamentals', program: 'Job Ready Program', issuedAt: daysAgo(6), weeks: 6, tutor: 'Rajesh Kumar' },
    { id: 'BODHIN-SEO-2026-0412', userId: 'u_arjun', title: 'SEO & Content Strategy', program: 'Certification Course', issuedAt: daysAgo(15), weeks: 4, tutor: 'Rajesh Kumar' },
    { id: 'BODHIN-GA-2026-0298', userId: 'u_arjun', title: 'Google Analytics Basics', program: 'Short Course', issuedAt: daysAgo(48), weeks: 2, tutor: 'Rajesh Kumar' },
    { id: 'BODHIN-EXL-2026-0177', userId: 'u_arjun', title: 'Excel Essentials', program: 'Short Course', issuedAt: daysAgo(80), weeks: 2, tutor: 'Arun Prakash' },
  ],
  certRequests: [],
  certTemplates: {},
  tickets: [
    { id: 'BOD-4587', userId: 'u_arjun', category: 'Live Classes', subject: 'Unable to access live class recording', body: 'The recording for Oct 27 shows a spinner.', status: 'resolved', createdAt: daysAgo(7), replies: [{ by: 'Bodhin Support', text: 'Fixed — the recording finished processing. Please try again.', at: daysAgo(6.8) }] },
    { id: 'BOD-4609', userId: 'u_rajesh', category: 'Payments & Enrollment', subject: 'Payout amount looks lower this week', body: 'My marketplace payout for last week is ₹2,000 less than my statement. Can you check the refund deduction?', status: 'open', createdAt: daysAgo(0.3), replies: [] },
    { id: 'BOD-4606', userId: 'u_arjun', category: 'Course & Learning', subject: 'Downloaded videos not playing offline', body: 'Lessons I downloaded in Module 3 show an error when I am offline on my Android phone.', status: 'open', createdAt: daysAgo(1.1), replies: [] },
    { id: 'BOD-4521', userId: 'u_arjun', category: 'Certificates', subject: 'Certificate download not working', body: 'Download button does nothing on my phone.', status: 'in_progress', createdAt: daysAgo(9), replies: [{ by: 'Bodhin Support', text: 'Thanks, we have reproduced it on Android 12 and are working on a fix.', at: daysAgo(8.5) }] },
  ],
  notifications: [
    { id: 'n1', userId: 'u_arjun', kind: 'live', title: 'Live class has started', body: 'SEO Strategy with AI Tools is live now. Join in one tap.', at: daysAgo(0.02), read: false, link: { pathname: '/live-room/[id]', params: { id: 'ls_now' } } },
    { id: 'n2', userId: 'u_arjun', kind: 'grade', title: 'Assignment graded: 92%', body: 'Rajesh Kumar graded “Final Project – Digital Marketing Campaign”.', at: daysAgo(0.3), read: false, link: { pathname: '/assignment/[id]', params: { id: 'asg_final' } } },
    { id: 'n3', userId: 'u_arjun', kind: 'qa', title: 'New answer to a question', body: 'Your tutor answered a question in “What is Digital Marketing?”.', at: daysAgo(1.2), read: false, link: { pathname: '/learn/[courseId]', params: { courseId: 'c_dm_ai', lesson: 'dm_m1_l1' } } },
    { id: 'n4', userId: 'u_arjun', kind: 'course', title: 'New lessons added', body: 'Module 5: AI Tools for Marketing now has 2 new lessons.', at: daysAgo(2), read: true, link: { pathname: '/course/[id]', params: { id: 'c_dm_ai' } } },
    { id: 'n5', userId: 'u_arjun', kind: 'payment', title: 'Payment received', body: '₹17,500 for Digital Marketing & AI Mastery. Invoice BOD-INV-2026-00412.', at: daysAgo(5), read: true, link: { pathname: '/payments' } },
    { id: 'n6', userId: 'u_arjun', kind: 'system', title: 'Certificate issued', body: 'Your certificate for Digital Marketing Fundamentals is ready to share.', at: daysAgo(6), read: true, link: { pathname: '/certificates' } },
  ],
  settings: {},
  feedback: [],
  platformConfig: { ...DEFAULT_PLATFORM_CONFIG },
  usage: { t_rajesh: { activeStudents: 1312, storageGb: 98, liveHours: 182, tutorSeats: 2 } },
  tenantStats: { t_rajesh: { students: 1312, studentsDelta: 12, completion: { completed: 972, inProgress: 246, notStarted: 94 }, earningsHistory: [28400, 31200, 29800, 35600, 33900, 39800, 42100, 39700] } },
  courses: educatorCourses(),
  tutorProfiles: [],
  assessments: [],
  customQuestions: [],
  reports: seedPlatform().reports,
  refundRequests: seedPlatform().refunds,
  audit: seedPlatform().audit,
  platformHistory: seedPlatform().history,
  adminVerified: {},
  catalog: { plans: {}, features: {}, addonPrices: {} },
  payoutRuns: [
    { id: 'po_2026_44', date: hoursAgo(8), status: 'paid', approvedBy: 'Kavitha S', approvedAt: hoursAgo(30), paidAt: hoursAgo(8), lines: [
      { tenantId: 't_rajesh', name: 'Rajesh Kumar Academy', amount: 21840, orders: 3, bank: 'HDFC Bank ••4821', utr: 'HDFCR52026110301' },
      { tenantId: 't_tnpscwinners', name: 'TNPSC Winners Academy', amount: 98420, orders: 31, bank: 'HDFC Bank ••2548', utr: 'HDFCR52026110302' },
      { tenantId: 't_neetbiology', name: 'NEET Biology Hub', amount: 61200, orders: 18, bank: 'ICICI Bank ••3096', utr: 'ICICR52026110303' },
      { tenantId: 't_priyacodes', name: 'Priya Codes', amount: 52700, orders: 15, bank: 'HDFC Bank ••2000', utr: 'HDFCR52026110304' },
      { tenantId: 't_spokenenglishpro', name: 'Spoken English Pro', amount: 25300, orders: 9, bank: 'State Bank of India ••2274', utr: 'SBINR52026110305' },
      { tenantId: 't_mathsmagic', name: 'Maths Magic with Arun', amount: 18450, orders: 6, bank: 'ICICI Bank ••2137', utr: 'ICICR52026110306' },
      { tenantId: 't_stockmarketsimple', name: 'Stock Market Simplified', amount: 6700, orders: 2, bank: 'State Bank of India ••2822', utr: 'SBINR52026110307' },
    ] },
  ],
  payoutHolds: {},
  curation: { featured: ['c_dm_ai', 'c_career'], banners: ['c_dm_ai'], categories: null },
  userLocks: {},
  broadcasts: [{ id: 'bc1', at: hoursAgo(24 * 9), by: 'Bodhin Admin', audience: 'All educators', title: 'Diwali campaign slots open', body: 'Get your course featured in the Diwali marketplace campaign. Turn on “Promotion” in course listing before 25 Oct.', reached: 10 }],
  flags: { tutorSignups: true, marketplaceCheckout: true, liveClasses: true, maintenance: { on: false, message: 'Scheduled maintenance tonight 11:30 PM – 12:30 AM IST. Videos and live classes may be unavailable.' } },
  configHistory: [
    { id: 'ch1', at: hoursAgo(24 * 21), by: 'Bodhin Admin', area: 'platform', label: 'Platform rules', changes: [{ field: 'Refund hold', from: '5 days', to: '7 days' }], reason: 'Match the 7-day refund policy on the website' },
    { id: 'ch2', at: hoursAgo(24 * 45), by: 'Bodhin Admin', area: 'plan', label: 'Growth', changes: [{ field: 'Tutor seats', from: '3', to: '5' }], reason: 'Academies asked for more tutor seats' },
  ],
  tenantNotes: [
    { id: 'tn1', tenantId: 't_spokenenglishpro', text: 'Card expired. Owner said she will update by Monday — follow up if still failed.', by: 'Kavitha S', at: hoursAgo(20) },
    { id: 'tn2', tenantId: 't_rajesh', text: 'Top marketplace seller. Offered a featured slot in the Diwali campaign.', by: 'Bodhin Admin', at: hoursAgo(72) },
  ],
  coupons: [
    { id: 'cp1', tenantId: 't_rajesh', code: 'DIWALI25', type: 'pct', value: 25, courseIds: [], maxUses: 100, used: 38, startsAt: daysAgo(10), endsAt: new Date(Date.now() + 4 * 864e5).toISOString(), paused: false, createdAt: daysAgo(12) },
    { id: 'cp2', tenantId: 't_rajesh', code: 'SEO1000', type: 'flat', value: 1000, courseIds: ['c_seo_growth'], maxUses: 50, used: 50, startsAt: daysAgo(40), endsAt: new Date(Date.now() + 20 * 864e5).toISOString(), paused: false, createdAt: daysAgo(41) },
    { id: 'cp3', tenantId: 't_rajesh', code: 'ALUMNI15', type: 'pct', value: 15, courseIds: ['c_dm_ai', 'c_meta_ads'], maxUses: null, used: 12, startsAt: daysAgo(90), endsAt: daysAgo(5), paused: false, createdAt: daysAgo(91) },
  ],
  invoices: [
    { id: 'inv1', tenantId: 't_rajesh', no: 'BOD-SUB-2026-01842', at: '2026-02-01T09:00:00+05:30', description: 'Institute plan · annual (Feb 2026 – Jan 2027)', amountInr: 90612, status: 'paid' },
    { id: 'inv2', tenantId: 't_rajesh', no: 'BOD-SUB-2025-00977', at: '2025-12-01T09:00:00+05:30', description: 'Growth plan · monthly (Dec 2025)', amountInr: 4129, status: 'paid' },
    { id: 'inv3', tenantId: 't_rajesh', no: 'BOD-SUB-2025-00731', at: '2025-11-02T09:00:00+05:30', description: 'Growth plan · monthly (Nov 2025)', amountInr: 4129, status: 'paid' },
  ],
  invites: [{ id: 'iv1', tenantId: 't_rajesh', name: 'Karthik Raja', email: 'karthik.raja@email.com', courseIds: ['c_seo_growth'], sentAt: daysAgo(2) }],
  ...batchData(),
  tutorAssignments: [
    { userId: 'u_meera', courseId: 'c_dm_ai' },
    { userId: 'u_meera', courseId: 'c_meta_ads' },
  ],
  activity: [
    { id: 'a1', tenantId: 't_rajesh', kind: 'enroll', text: '12 new students enrolled in “Digital Marketing & AI Mastery”', at: hoursAgo(0.2), link: { pathname: '/educator/batches' } },
    { id: 'a2', tenantId: 't_rajesh', kind: 'live', text: 'Live class “SEO & Content Strategy – Part 2” completed · 26/28 attended', at: hoursAgo(2), link: { pathname: '/educator/live' } },
    { id: 'a3', tenantId: 't_rajesh', kind: 'submission', text: '8 assignments submitted for “Keyword Research Project”', at: hoursAgo(4) },
    { id: 'a4', tenantId: 't_rajesh', kind: 'payout', text: 'Marketplace payout of ₹21,840 sent to HDFC ••4821', at: hoursAgo(26), link: { pathname: '/edu/earnings' } },
    { id: 'a5', tenantId: 't_rajesh', kind: 'certificate', text: '5 certificates issued for “Advanced SEO & Growth”', at: hoursAgo(30) },
  ],
});

/** Two of Rajesh's courses in other states so the Courses tab shows the full lifecycle. */
function educatorCourses(): Course[] {
  const base = { tenantId: 't_rajesh', tutorId: 'tu_rajesh', rating: 0, ratingCount: 0, students: 0, projects: 1, certificate: true, collections: [], language: 'English', accessMonths: 12, drip: { enabled: false, everyDays: 7 } };
  return [
    {
      ...base,
      id: 'c_wa_auto',
      title: 'WhatsApp Marketing & Automation',
      subtitle: 'Broadcasts, catalogues and chat flows that sell on autopilot.',
      description: 'Set up WhatsApp Business, build broadcast lists that stay compliant, design catalogue flows and automate replies with no-code tools.',
      categoryId: 'marketing',
      level: 'beginner',
      format: 'recorded',
      priceInr: 3999,
      visibility: 'public',
      moderation: 'pending',
      outcomes: ['Set up WhatsApp Business properly', 'Grow opt-in broadcast lists', 'Build catalogue + order flows', 'Automate replies with no-code tools'],
      art: { from: '#065F46', to: '#22C55E', icon: 'chatbubbles' },
      publishedAt: new Date(Date.now() - 864e5).toISOString(),
      updatedAt: new Date(Date.now() - 864e5).toISOString(),
      status: 'published',
      modules: [
        { id: 'wa_m1', title: 'Getting Started', lessons: [
          { id: 'wa_m1_l1', title: 'WhatsApp Business vs API', type: 'video', durationSec: 640, preview: true, completion: 'watch_90' },
          { id: 'wa_m1_l2', title: 'Profile, catalogue and labels', type: 'video', durationSec: 812, completion: 'watch_90' },
        ] },
        { id: 'wa_m2', title: 'Broadcasts That Convert', lessons: [
          { id: 'wa_m2_l1', title: 'Opt-in and compliance', type: 'video', durationSec: 705, completion: 'watch_90' },
          { id: 'wa_m2_l2', title: 'Broadcast templates', type: 'pdf', sizeMb: 1.4 },
        ] },
      ],
    },
    {
      ...base,
      id: 'c_reels',
      title: 'Instagram Reels for Business',
      subtitle: '',
      description: '',
      categoryId: 'marketing',
      level: 'beginner',
      format: 'recorded',
      priceInr: 0,
      visibility: 'private',
      moderation: 'approved',
      outcomes: ['Plan a month of Reels in one sitting'],
      art: { from: '#BE185D', to: '#F97316', icon: 'logo-instagram' },
      publishedAt: '',
      updatedAt: new Date(Date.now() - 3 * 36e5).toISOString(),
      status: 'draft',
      modules: [{ id: 'reels_m1', title: 'Reels Basics', lessons: [] }],
    },
  ];
}

function batchData() {
  const d = seedBatchData();
  return { batches: d.batches, classSessions: d.sessions, people: d.people, batchAttendance: d.attendance, announcements: d.announcements, sessionSummaries: {} as Record<string, LiveSummary>, sessionStatus: {} as Record<string, 'conducted' | 'cancelled'> };
}

function mergeExtras(d: Db): Db {
  const pl = seedPlatform();
  d.users.push(...pl.users);
  d.memberships.push(...pl.memberships);
  d.tenants.push(...pl.tenants);
  Object.assign(d.tenantStats, pl.stats);
  Object.assign(d.usage, pl.usage);
  d.applications.push(...pl.applications);
  d.courses.push(...pl.pendingCourses);
  d.orders.push(...pl.ownOrders);
  const x = assessExtras();
  d.submissions.push(...x.extraSubs);
  d.attempts.push(...x.extraAttempts);
  d.questions.push(...x.extraQuestions);
  return d;
}

/** Classmates' submissions, quiz attempts and doubts so grading, results and the doubts inbox look real. */
function assessExtras() {
  const people = seedBatchData().people.filter((p) => p.courses.some((c) => c.batchId === 'b_dm_wk') && p.id !== 'p_arjun');
  let r = 7;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const subs: Submission[] = [];
  const files = ['keyword-strategy.pdf', 'kw-research-final.pdf', 'keywords-cluster.docx', 'seo-keywords.pdf'];
  people.forEach((p, i) => {
    const uid = `person:${p.id}`;
    if (i < 9) subs.push({ id: `sub_kw_${p.id}`, userId: uid, personId: p.id, assessmentId: 'asg_kw', status: 'submitted', files: [{ name: files[i % 4], sizeMb: Math.round((0.8 + rnd() * 4) * 10) / 10 }], link: i % 3 === 0 ? 'https://docs.google.com/document/d/kw-' + p.id : undefined, note: i % 2 ? 'Niche: home bakery in Madurai.' : '', updatedAt: hoursAgo(2 + i * 3), submittedAt: hoursAgo(2 + i * 3) });
    if (i < 20) {
      const late = i % 7 === 3;
      const graded = i < 14;
      const rub = [{ item: 'Three content pillars', score: 0, max: 7 }, { item: '12 post ideas with formats', score: 0, max: 7 }, { item: 'Posting schedule', score: 0, max: 6 }].map((x) => ({ ...x, score: Math.max(2, Math.round(x.max * (0.6 + rnd() * 0.4))) }));
      const pct = Math.round((rub.reduce((a, b) => a + b.score, 0) / 20) * 100);
      subs.push({ id: `sub_ct_${p.id}`, userId: uid, personId: p.id, assessmentId: 'asg_content', status: graded ? 'graded' : 'submitted', files: [{ name: 'content-calendar.pdf', sizeMb: Math.round((1 + rnd() * 3) * 10) / 10 }], note: '', updatedAt: daysAgo(late ? 0.5 : 1 + rnd() * 3), submittedAt: daysAgo(late ? 0.5 : 1.2 + rnd() * 3), grade: graded ? { pct, feedback: pct >= 85 ? 'Strong pillars and a realistic schedule.' : 'Good start — make the post ideas more specific to the audience.', rubric: rub, by: i % 2 ? 'Meera Iyer' : 'Rajesh Kumar', at: daysAgo(0.6) } : undefined });
    }
  });
  const ex = ASSESSMENTS.find((a) => a.id === 'ex_m2')!;
  const exQs = ex.questionIds!.map((q) => QUESTIONS.find((x) => x.id === q)!);
  const attempts: Attempt[] = people.slice(0, 22).map((p, i) => {
    const skill = 0.55 + rnd() * 0.42;
    const answers = exQs.map((q, k) => (rnd() < skill - (k % 5 === 3 ? 0.3 : 0) ? q.correct : (q.correct + 1) % q.options.length));
    const s = score(exQs, answers, ex.marks);
    return { id: `att_ex_${p.id}`, userId: `person:${p.id}`, assessmentId: 'ex_m2', answers, startedAt: daysAgo(3 + i * 0.1), submittedAt: daysAgo(3 + i * 0.1), timeTakenSec: 1100 + Math.round(rnd() * 600), ...s, rank: 0, of: 22 };
  });
  const lessons = courses.find((c) => c.id === 'c_dm_ai')!.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'video'));
  const ask: [number, number, string, number, boolean][] = [
    [0, 3, 'For keyword research, should we focus on Tamil keywords as well for local businesses?', 1.5, false],
    [5, 6, 'In GA4, why does my real-time report show 0 users even though I opened the site?', 3, false],
    [9, 8, 'What is a good CTR for search ads in the education niche?', 6, false],
    [2, 9, 'Can we use AI tools to write meta descriptions, or will Google penalise it?', 20, false],
    [12, 4, 'How many hashtags should we use on Instagram Reels in 2026?', 28, false],
    [7, 2, 'Is it okay to submit the assignment as a Canva link instead of a PDF?', 40, true],
    [15, 5, 'What budget did you use for the Meta Ads demo campaign?', 52, true],
  ];
  const qs = ask.map(([pi, li, text, h, answered], k) => {
    const p = people[pi];
    const l = lessons[Math.min(li, lessons.length - 1)];
    return { id: `dq${k + 1}`, courseId: 'c_dm_ai', lessonId: l.id, userId: `person:${p.id}`, personId: p.id, userName: p.name, text, createdAt: hoursAgo(h), answer: answered ? { by: 'Rajesh Kumar', text: k === 5 ? 'Yes — a view-only Canva link is fine. Make sure “Anyone with the link” can view it.' : '₹300/day for 5 days, split across two audiences.', at: hoursAgo(h - 2) } : undefined };
  });
  return { extraSubs: subs, extraAttempts: attempts, extraQuestions: qs };
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 36e5).toISOString();
}

/** This month's sales for Rajesh's academy — both channels, so Earnings shows a real split. */
function seedTenantOrders(): Order[] {
  const buyers = ['Priya S.', 'Karthik R.', 'Divya M.', 'Arun K.', 'Sneha R.', 'Vignesh M.', 'Harini P.', 'Sanjay K.', 'Kavya R.', 'Meena V.', 'Rahul P.', 'Ananya R.'];
  const plan: [string, number, number, 'tutor_direct' | 'bodhin_marketplace'][] = [
    ['c_dm_ai', 17500, 0.3, 'bodhin_marketplace'], ['c_seo_growth', 8999, 1.1, 'tutor_direct'], ['c_meta_ads', 5500, 1.8, 'tutor_direct'],
    ['c_dm_ai', 17500, 2.4, 'tutor_direct'], ['c_ga4', 2999, 3.2, 'tutor_direct'], ['c_seo_growth', 8999, 4.0, 'bodhin_marketplace'],
    ['c_meta_ads', 5500, 5.5, 'bodhin_marketplace'], ['c_dm_ai', 15750, 9.0, 'bodhin_marketplace'], ['c_ga4', 2999, 11, 'tutor_direct'],
    ['c_seo_growth', 8999, 12.5, 'tutor_direct'], ['c_dm_ai', 17500, 15, 'tutor_direct'], ['c_meta_ads', 5500, 18, 'bodhin_marketplace'],
  ];
  return plan.map(([courseId, amount, days, channel], i) => {
    const route = paymentRoute('t_rajesh', channel === 'tutor_direct' ? 't_rajesh' : null);
    const split = splitOrder(amount, route);
    const at = new Date(Date.now() - days * 864e5).toISOString();
    const payoutDate = channel === 'bodhin_marketplace' ? payoutDateFor(at) : undefined;
    return {
      id: `o_t${i + 1}`, userId: `u_buyer_${i}`, courseId, amountInr: amount, discountInr: 0, method: i % 3 ? 'upi' : 'card', status: 'paid', createdAt: at,
      invoiceNo: channel === 'tutor_direct' ? `RKA-2026-${String(310 + i).padStart(4, '0')}` : `BOD-INV-2026-${String(380 + i).padStart(5, '0')}`,
      source: channel === 'tutor_direct' ? 'direct' : 'bodhin_referral', commissionInr: split.commission, educatorShareInr: split.educatorNet,
      channel, collector: route.collector, sellerTenantId: 't_rajesh', gatewayFeeInr: split.gatewayFee,
      payoutStatus: channel === 'tutor_direct' ? 'not_applicable' : new Date(payoutDate!).getTime() < Date.now() ? 'paid' : days < 7 ? 'on_hold' : 'scheduled',
      payoutDate, buyerName: buyers[i],
    } as Order;
  });
}

function daysAgo(d: number) {
  return new Date(Date.now() - d * 864e5).toISOString();
}

/** Arjun's past quiz attempts for quizzes he has already passed in the curriculum. */
function seedAttempts(): Attempt[] {
  const plan: [string, number[]][] = [
    ['as_dm_m1_l5', [0, 1, 0, 0, 1, 1, 0, 0, 1, 0]],
    ['as_dm_m2_l6', [0, 1, 1, 1, 1, 1, 1, 1, 0, 0]],
  ];
  return plan.flatMap(([id, ans], k) => {
    const a = ASSESSMENTS.find((x) => x.id === id);
    if (!a) return [];
    const qs = a.questionIds!.map((q) => QUESTIONS.find((x) => x.id === q)!);
    const s = score(qs, ans, a.marks);
    return [{ id: `att_seed_${k}`, userId: 'u_arjun', assessmentId: id, answers: ans, startedAt: daysAgo(8 - k * 3), submittedAt: daysAgo(8 - k * 3), timeTakenSec: 872 - k * 60, ...s, rank: 3, of: 48 }];
  });
}

/** Demo enrollment for Arjun with the first `done` lessons completed. */
function seedEnrollment(courseId: string, done: number, enrolledAt: string, hoursAgo: number): Enrollment {
  const lessons = courses.find((c) => c.id === courseId)!.modules.flatMap((m) => m.lessons);
  return {
    userId: 'u_arjun',
    courseId,
    enrolledAt,
    validTill: '2027-06-30',
    completedLessonIds: lessons.slice(0, done).map((l) => l.id),
    lastLessonId: lessons[Math.min(done, lessons.length - 1)].id,
    lastActiveAt: new Date(Date.now() - hoursAgo * 36e5).toISOString(),
    source: courseId === 'c_dm_ai' ? 'bodhin_campaign' : 'direct',
  };
}

const KEY = 'bodhin.mockdb.v28';
const canPersist = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function load(): Db {
  if (canPersist) {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) return { ...seed(), ...(JSON.parse(raw) as Db) }; // new fields fall back to seed defaults
    } catch {
      /* storage blocked → fall back to seed */
    }
  }
  return seed();
}

export const db: Db = load();

export function persist() {
  if (!canPersist) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
