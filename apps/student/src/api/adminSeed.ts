/** Platform-wide demo data for the Super Admin portal: admins, more workspaces, applications, reports, audit. */
import type { AuditEntry } from '@/core/admin';
import type { TenantSubscription } from '@/core/business';
import type { Course } from '@/core/catalog';
import type { PlanId } from '@/core/plans';
import type { EducatorApplication, Membership, Tenant, User } from '@/core/types';
import { courses as catalog } from './catalogSeed';

const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const hrs = (h: number) => new Date(Date.now() - h * 36e5).toISOString();

export interface PlatformReport { id: string; kind: 'review' | 'course' | 'user'; targetId: string; label: string; reason: string; detail: string; by: string; at: string; status: 'open' | 'resolved'; resolution?: string }
export interface RefundRequest { id: string; orderId: string; tenantId: string; buyer: string; course: string; amountInr: number; reason: string; at: string; status: 'open' | 'approved' | 'rejected' }
export interface TenantExtra { students: number; studentsDelta: number; completion: { completed: number; inProgress: number; notStarted: number }; earningsHistory: number[]; monthDirect?: number; monthMarket?: number; payoutDue?: number; courseCount?: number }

type W = [slug: string, name: string, owner: string, plan: PlanId, status: TenantSubscription['status'], billing: 'monthly' | 'annual', periodEndDays: number, usage: [number, number, number, number], gw: boolean, bank: boolean, createdDays: number, colors: [string, string, string], monthDirect: number, monthMarket: number, city: string];
const WORKSPACES: W[] = [
  ['priyacodes', 'Priya Codes', 'Priya Sharma', 'growth', 'active', 'monthly', 18, [462, 41, 72, 3], true, true, -210, ['#6D28D9', '#3B1580', '#F59E0B'], 61200, 28400, 'Chennai'],
  ['mathsmagic', 'Maths Magic with Arun', 'Arun Prakash', 'creator', 'active', 'annual', 140, [150, 12, 21, 1], true, true, -300, ['#B91C1C', '#651010', '#EAB308'], 22400, 9800, 'Coimbatore'],
  ['spokenenglishpro', 'Spoken English Pro', 'Lakshmi Narayanan', 'growth', 'past_due', 'monthly', -3, [388, 33, 64, 2], true, true, -160, ['#0E7490', '#073F4F', '#F97316'], 18900, 12100, 'Madurai'],
  ['designwithdeepa', 'Design with Deepa', 'Deepa Krishnan', 'growth', 'trialing', 'monthly', 2, [41, 4.6, 6, 1], false, false, -5, ['#9D174D', '#560C2A', '#10B981'], 0, 0, 'Bengaluru'],
  ['tnpscwinners', 'TNPSC Winners Academy', 'S. Karthikeyan', 'institute', 'active', 'annual', 260, [1190, 121, 198, 14], true, true, -420, ['#14532D', '#0B2E19', '#EAB308'], 148500, 36200, 'Tiruchirappalli'],
  ['yogawithmeena', 'Yoga with Meena', 'Meena Rajan', 'starter', 'active', 'monthly', 9, [50, 3.1, 9.5, 1], true, false, -95, ['#0F6E5A', '#073D33', '#F59E0B'], 7800, 0, 'Pondicherry'],
  ['stockmarketsimple', 'Stock Market Simplified', 'Vikram Iyer', 'growth', 'trialing', 'monthly', 6, [96, 8, 11, 1], true, true, -3, ['#1F2937', '#0B1017', '#22C55E'], 4500, 0, 'Chennai'],
  ['carnaticclass', 'Carnatic Music Class', 'Sangeetha V', 'starter', 'cancelled', 'monthly', -20, [12, 2.2, 0, 1], false, true, -240, ['#7C2D12', '#431407', '#FBBF24'], 0, 0, 'Thanjavur'],
  ['neetbiology', 'NEET Biology Hub', 'Dr. Haris M', 'growth', 'active', 'annual', 75, [431, 47.5, 89, 4], true, true, -180, ['#1D4ED8', '#0F2A75', '#F472B6'], 74200, 22800, 'Salem'],
];

export function seedPlatform() {
  const users: (User & { password: string })[] = [
    { id: 'u_admin', name: 'Bodhin Admin', email: 'admin@demo.in', phone: '+919000000001', phoneVerified: true, password: 'demo123', createdAt: '2025-09-01T10:00:00Z' },
    { id: 'u_fin', name: 'Kavitha S', email: 'finance@demo.in', phone: '+919000000002', phoneVerified: true, password: 'demo123', createdAt: '2025-10-01T10:00:00Z' },
    { id: 'u_mod', name: 'Arul Murugan', email: 'moderator@demo.in', phone: '+919000000003', phoneVerified: true, password: 'demo123', createdAt: '2025-10-01T10:00:00Z' },
    { id: 'u_sup', name: 'Nisha Rani', email: 'support@demo.in', phone: '+919000000004', phoneVerified: true, password: 'demo123', createdAt: '2025-10-01T10:00:00Z' },
  ];
  const memberships: Membership[] = [
    { userId: 'u_admin', tenantId: 't_bodhin', role: 'super_admin' },
    { userId: 'u_fin', tenantId: 't_bodhin', role: 'finance' },
    { userId: 'u_mod', tenantId: 't_bodhin', role: 'moderator' },
    { userId: 'u_sup', tenantId: 't_bodhin', role: 'support' },
  ];
  const tenants: Tenant[] = [];
  const stats: Record<string, TenantExtra> = {};
  WORKSPACES.forEach(([slug, name, owner, plan, status, billing, end, [st, gb, lh, seats], gw, bank, created, [p, pd, a], md, mm], i) => {
    const uid = `u_own_${slug}`;
    users.push({ id: uid, name: owner, email: `${slug}@demo.in`, phone: `+91980000${String(1000 + i)}`, phoneVerified: true, password: 'demo123', createdAt: day(created) });
    memberships.push({ userId: uid, tenantId: `t_${slug}`, role: 'owner' }, { userId: uid, tenantId: 't_bodhin', role: 'student' });
    tenants.push({
      id: `t_${slug}`, slug, status: status === 'cancelled' && i === 7 ? 'suspended' : 'active', plan, ownerUserId: uid, createdAt: day(created),
      branding: { displayName: name, primary: p, primaryDeep: pd, accent: a },
      subscription: { plan, status, billing, periodEnd: day(end), addons: slug === 'neetbiology' ? [{ kind: 'storage', qty: 1 }] : [] },
      payments: { directGateway: gw ? 'razorpay' : null, directGatewayStatus: gw ? 'active' : 'not_connected', payoutAccount: bank ? { bank: ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank'][i % 4], last4: String(2000 + i * 137).slice(-4), verified: true } : null },
      domain: slug === 'neetbiology' ? { host: 'learn.neetbiologyhub.in', status: 'pending_dns', addedAt: day(-2) } : slug === 'tnpscwinners' ? { host: 'courses.tnpscwinners.com', status: 'active', addedAt: day(-300) } : null,
      customDomain: slug === 'tnpscwinners' ? 'courses.tnpscwinners.com' : undefined,
    });
    const hist = Array.from({ length: 8 }, (_, k) => Math.round((md + mm * 0.78) * (0.55 + k * 0.06)));
    stats[`t_${slug}`] = { students: Math.round(st * 1.6), studentsDelta: Math.round(st * 0.04), completion: { completed: Math.round(st * 0.6), inProgress: Math.round(st * 0.3), notStarted: Math.round(st * 0.1) }, earningsHistory: hist, monthDirect: md, monthMarket: mm, payoutDue: Math.round(mm * 0.78 * 0.6), courseCount: 2 + (i % 5) };
  });
  const usage = Object.fromEntries(WORKSPACES.map(([slug, , , , , , , [st, gb, lh, seats]]) => [`t_${slug}`, { activeStudents: st, storageGb: gb, liveHours: lh, tutorSeats: seats }]));

  // Pending educator applications (SA2 reviews these).
  const apps: [string, string, string, string[], number, string, number, boolean, number][] = [
    ['Ramya Sundar', 'ramya', 'Ramya’s Data Science Lab', ['Python', 'Data Science'], 6, 'Chennai', 300, true, 3],
    ['Mohammed Irfan', 'irfan', 'Irfan Arabic & Quran Academy', ['Arabic', 'Quran Recitation'], 9, 'Vellore', 120, true, 7],
    ['Gowtham Raj', 'gowtham', 'Gowtham Fitness Coaching', ['Fitness', 'Nutrition'], 4, 'Madurai', 80, false, 20],
    ['Janani Venkat', 'janani', 'Bharatanatyam with Janani', ['Dance', 'Bharatanatyam'], 12, 'Chennai', 60, true, 30],
    ['Suresh Babu', 'suresh', 'GST & Tally Made Easy', ['Accounting', 'GST', 'Tally'], 15, 'Erode', 500, true, 46],
    ['Fathima Begum', 'fathima', 'Tailoring at Home', ['Tailoring', 'Fashion design'], 8, 'Tirunelveli', 150, false, 70],
  ];
  const applications: EducatorApplication[] = apps.map(([name, slug, ws, subjects, yrs, city, planned, idv, h], i) => {
    const uid = `u_app_${slug}`;
    users.push({ id: uid, name, email: `${slug}.apply@demo.in`, phone: `+91970000${String(1000 + i)}`, phoneVerified: true, password: 'demo123', createdAt: hrs(h) });
    memberships.push({ userId: uid, tenantId: 't_bodhin', role: 'student' });
    return { id: `app_${slug}`, userId: uid, status: i === 5 ? 'changes_requested' : i === 4 ? 'under_review' : 'submitted', submittedAt: hrs(h), workspaceName: ws, subjects, experienceYears: yrs, city, plannedStudents: planned, sampleUrl: `https://youtube.com/@${slug}-teaches`, idVerified: idv, note: i === 5 ? 'Please add a sample lesson video and your ID proof.' : undefined, reviewedBy: i === 5 ? 'Arul Murugan' : undefined, reviewedAt: i === 5 ? hrs(40) : undefined };
  });

  // Two public courses from other workspaces waiting for marketplace review.
  const base = catalog.find((c) => c.id === 'c_ga4')!;
  const pending: Course[] = [
    { ...base, id: 'c_pc_react', tenantId: 't_priyacodes', tutorId: 'tu_rajesh', title: 'React Native for Beginners (Tamil)', subtitle: 'Build your first Android & iOS app in Tamil.', description: 'Learn React Native from zero in Tamil. Set up your laptop, build three small apps (to-do, weather, expense tracker) and publish one to the Play Store.', outcomes: ['Set up React Native and Expo', 'Build screens with components and state', 'Call a real API and show data', 'Publish an app to the Play Store'], priceInr: 3499, compareAtInr: undefined, offerEndsAt: undefined, visibility: 'public', moderation: 'pending', status: 'published', students: 0, rating: 0, ratingCount: 0, art: { from: '#6D28D9', to: '#A78BFA', icon: 'code-slash' }, publishedAt: hrs(5), updatedAt: hrs(5) },
    { ...base, id: 'c_neet_bot', tenantId: 't_neetbiology', tutorId: 'tu_rajesh', title: 'NEET Botany Crash Course 2027', subtitle: 'High-yield chapters with 1,200 MCQs.', description: 'A focused 8-week revision of NEET Botany: plant physiology, genetics, ecology and morphology, with 1,200 previous-year style MCQs and weekly mock tests.', outcomes: ['Revise every high-weightage Botany chapter', 'Solve 1,200 NEET-style MCQs', 'Take 8 timed mock tests', 'Fix weak topics with chapter-wise analysis'], priceInr: 4999, compareAtInr: 7999, offerEndsAt: day(10), visibility: 'public_promoted', moderation: 'pending', status: 'published', students: 0, rating: 0, ratingCount: 0, art: { from: '#1D4ED8', to: '#60A5FA', icon: 'leaf' }, publishedAt: hrs(26), updatedAt: hrs(26) },
  ];

  const reports: PlatformReport[] = [
    { id: 'rp1', kind: 'review', targetId: 'c_seo_growth', label: 'Review on “Advanced SEO & Growth”', reason: 'Spam / promotion', detail: '“Join my Telegram for free SEO course 👉 t.me/…” — posted by a non-enrolled pattern account.', by: 'Rajesh Kumar (educator)', at: hrs(6), status: 'open' },
    { id: 'rp2', kind: 'course', targetId: 'c_pc_react', label: 'Course “React Native for Beginners (Tamil)”', reason: 'Possible copied content', detail: 'Learner says lessons 3–5 match a YouTube channel. Needs a check before approving the listing.', by: 'Karthik R. (learner)', at: hrs(20), status: 'open' },
    { id: 'rp3', kind: 'user', targetId: 'u_x2', label: 'Learner account “Arun K.”', reason: 'Abusive messages', detail: 'Two tutors reported rude messages in lesson Q&A.', by: 'Meera Iyer (tutor)', at: hrs(50), status: 'open' },
  ];
  const refunds: RefundRequest[] = [
    { id: 'rf1', orderId: 'o_t1', tenantId: 't_rajesh', buyer: 'Priya S.', course: 'Digital Marketing & AI Mastery (2026)', amountInr: 17500, reason: 'Bought twice by mistake (second account).', at: hrs(9), status: 'open' },
    { id: 'rf2', orderId: 'o_bod_9', tenantId: 't_bodhin', buyer: 'Harish V.', course: 'Career Launchpad: Communication & Interviews', amountInr: 2999, reason: 'Course language not what I expected.', at: hrs(30), status: 'open' },
  ];
  const audit: AuditEntry[] = [
    { id: 'au1', at: hrs(3), actorId: 'u_mod', actorName: 'Arul Murugan', action: 'course.approve', target: { kind: 'course', id: 'c_meta_ads', label: 'Meta Ads Masterclass' }, summary: 'Approved marketplace listing' },
    { id: 'au2', at: hrs(8), actorId: 'u_fin', actorName: 'Kavitha S', action: 'payout.run', target: { kind: 'payout', id: 'po_2026_44', label: 'Payout run · week 44' }, summary: 'Released ₹2,84,610 to 7 workspaces' },
    { id: 'au3', at: hrs(27), actorId: 'u_admin', actorName: 'Bodhin Admin', action: 'tenant.extend_trial', target: { kind: 'tenant', id: 't_stockmarketsimple', label: 'Stock Market Simplified' }, summary: 'Extended trial by 7 days' },
    { id: 'au4', at: hrs(40), actorId: 'u_mod', actorName: 'Arul Murugan', action: 'application.request_changes', target: { kind: 'application', id: 'app_fathima', label: 'Tailoring at Home' }, summary: 'Asked for sample lesson and ID proof' },
    { id: 'au5', at: hrs(52), actorId: 'u_sup', actorName: 'Nisha Rani', action: 'user.reset_password', target: { kind: 'user', id: 'u_arjun', label: 'Arjun Kumar' }, summary: 'Sent password reset link' },
  ];
  // Platform totals per month (last 8 months, oldest first) for the trend chart. Current month is computed live.
  const history = { gmv: [398000, 431000, 472000, 509000, 548000, 583000, 617000, 652000], bodhin: [96000, 104000, 113000, 121000, 130000, 139000, 148000, 158000] };
  const buyers = ['Harish V.', 'Sowmiya K.', 'Ravi Teja', 'Anitha M.', 'Kiran B.', 'Pavithra S.', 'Dinesh K.'];
  const ownOrders = buyers.map((b, i) => ({
    id: i === 0 ? 'o_bod_9' : `o_bod_${10 + i}`, userId: `u_buyer_bod_${i}`, courseId: 'c_career', amountInr: i === 3 ? 2699 : 2999, discountInr: i === 3 ? 300 : 0, coupon: i === 3 ? 'BODHIN10' : undefined,
    method: (i % 2 ? 'upi' : 'card') as 'upi' | 'card', status: 'paid' as const, createdAt: hrs(6 + i * 17), invoiceNo: `BOD-INV-2026-${String(520 + i).padStart(5, '0')}`, source: 'direct' as const,
    commissionInr: 0, educatorShareInr: 0, channel: 'bodhin_own' as const, collector: 'bodhin' as const, sellerTenantId: 't_bodhin', gatewayFeeInr: Math.round(2999 * 0.02), payoutStatus: 'not_applicable' as const, buyerName: b,
  }));
  return { users, memberships, tenants, stats, usage, applications, pendingCourses: pending, reports, refunds, audit, history, ownOrders };
}
