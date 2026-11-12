/**
 * Bodhin API client — the ONLY place screens get data from.
 * Today every function is backed by mockDb. To go live, the developer replaces the
 * body of each function with a fetch() to the real backend. Signatures stay the same,
 * so no screen code changes.
 */
import { db, persist, uid } from './mockDb';
import { categories as seedCategories, courses as seedCourses, liveSessions as seedLive, seedReviews, tutors as seedTutors } from './catalogSeed';
import { ASSESSMENTS, QUESTIONS } from './assessSeed';
import type { Coupon, EducatorApplication, Role, Session, Tenant, User } from '@/core/types';
import { ROLE_PERMS, isAdminRole, type AdminPerm, type AdminRole, type AuditEntry } from '@/core/admin';
import type { Category } from '@/core/catalog';
import { resolveHost } from '@/core/tenant';
import { COUPONS, allLessons, isPublished, onMarketplace, onWorkspace, matchesQuery, nextLesson, progressOf, ratingSplit, sortCourses, type Course, type CourseQuery, type Lesson, type Module, type Order, type PaymentMethod, type Review } from '@/core/catalog';
import { ADDON_CATALOG, ADDON_SIZES, PLAN_FEATURES, daysLeft, entitlements, paymentRoute, payoutDateFor, planBlockers, splitOrder, usageReport, type TenantSubscription } from '@/core/business';
import { PLANS, type Plan, type PlanId } from '@/core/plans';
import { attendancePct, batchStatus, generateSessions, weeksBetween, type Announcement, type AttendanceMark, type Batch, type Mark, type MemberStatus, type Person } from '@/core/batch';
import type { ClassSession, LiveSummary } from '@/core/batch';
import { joinWindow } from '@/live/protocol';
import { rubricOf, score as scoreQuiz, type Assessment, type AssessStatus, type Attempt, type Question, type Submission } from '@/core/assess';

/** Apply educator-created/edited courses on top of the demo catalogue (in place, so every reader sees them). */
function syncCourses() {
  db.tutorProfiles ??= [];
  for (const t of db.tutorProfiles) if (!seedTutors.some((x) => x.id === t.id)) seedTutors.push(t);
  for (const c of db.courses) {
    const i = seedCourses.findIndex((x) => x.id === c.id);
    i >= 0 ? (seedCourses[i] = c) : seedCourses.push(c);
  }
}
syncCourses();

/** Educator-authored assessments/questions overlay the seed lists (real: one assessments table). */
function syncAssessments() {
  for (const q of db.customQuestions) {
    const i = QUESTIONS.findIndex((x) => x.id === q.id);
    i >= 0 ? (QUESTIONS[i] = q) : QUESTIONS.push(q);
  }
  for (const a of db.assessments) {
    const i = ASSESSMENTS.findIndex((x) => x.id === a.id);
    i >= 0 ? (ASSESSMENTS[i] = a) : ASSESSMENTS.push(a);
  }
}
syncAssessments();

/** Super Admin catalogue edits (plans, features, add-on prices) applied over the code defaults. */
function syncCatalog() {
  for (const p of PLANS) Object.assign(p, db.catalog.plans[p.id] ?? {});
  for (const [k, f] of Object.entries(db.catalog.features)) (PLAN_FEATURES as Record<string, string[]>)[k] = f;
  for (const a of ADDON_CATALOG) if (db.catalog.addonPrices[a.kind] != null) a.monthlyInr = db.catalog.addonPrices[a.kind];
}
syncCatalog();

export class ApiError extends Error {
  constructor(public code: string, message: string, public field?: string) {
    super(message);
  }
}

/** POC only: the OTP every verification accepts. */
export const DEMO_OTP = '123456';

const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms));
const publicUser = ({ password: _pw, ...u }: User & { password: string }): User => u;
const normPhone = (p: string) => (p.startsWith('+') ? p : '+91' + p.replace(/\D/g, ''));

function sessionFor(userId: string): Session {
  const u = db.users.find((x) => x.id === userId)!;
  return { user: publicUser(u), memberships: db.memberships.filter((m) => m.userId === userId), token: uid('tok') };
}

function findByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (id.includes('@')) return db.users.find((u) => u.email.toLowerCase() === id);
  const digits = id.replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  return db.users.find((u) => u.phone.endsWith(digits.slice(-10)));
}

export const auth = {
  async signIn(identifier: string, password: string): Promise<Session> {
    await wait();
    const u = findByIdentifier(identifier);
    if (!u) throw new ApiError('not_found', 'No account found with this email or mobile number.', 'identifier');
    if (u.password !== password) throw new ApiError('bad_password', 'Incorrect password. Try again or reset it.', 'password');
    if (db.userLocks[u.id]) throw new ApiError('locked', 'This account is locked. Contact support@thebodhin.com.', 'identifier');
    return sessionFor(u.id);
  },

  async signUp(input: { name: string; email: string; phone: string; password: string; role: Extract<Role, 'student' | 'tutor'> }) {
    await wait();
    const email = input.email.trim().toLowerCase();
    const phone = normPhone(input.phone);
    if (input.role === 'tutor' && !db.flags.tutorSignups) throw new ApiError('paused', 'New educator sign-ups are paused for a short while. Please try again soon.');
    if (db.users.some((u) => u.email === email)) throw new ApiError('email_taken', 'This email is already registered. Sign in instead.', 'email');
    if (db.users.some((u) => u.phone === phone)) throw new ApiError('phone_taken', 'This mobile number is already registered.', 'phone');
    const user = { id: uid('u'), name: input.name.trim(), email, phone, phoneVerified: false, password: input.password, createdAt: new Date().toISOString() };
    db.users.push(user);
    db.memberships.push({ userId: user.id, tenantId: 't_bodhin', role: 'student' }); // educator access is granted on approval (Super Admin)
    if (input.role === 'tutor') db.applications.push({ id: uid('app'), userId: user.id, status: 'draft' });
    persist();
    return { userId: user.id, otpSentTo: phone };
  },

  /** Sends an OTP to a phone or email. Real backend: SMS/email provider + rate limit. */
  async sendOtp(target: string): Promise<{ sentTo: string }> {
    await wait(350);
    const u = findByIdentifier(target);
    if (!u) throw new ApiError('not_found', 'No account found with this email or mobile number.', 'target');
    return { sentTo: target.includes('@') ? u.email : u.phone };
  },

  async verifySignupOtp(userId: string, code: string): Promise<Session> {
    await wait();
    if (code !== DEMO_OTP) throw new ApiError('bad_otp', 'That code is not correct. Check the SMS and try again.', 'code');
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new ApiError('not_found', 'Account not found.');
    u.phoneVerified = true;
    // A tutor's application stays 'draft' until they complete the academy-details form (/apply).
    persist();
    return sessionFor(userId);
  },

  /**
   * Completes the educator application (blueprint: Draft → Submitted). Only a submitted
   * application reaches the Super Admin inbox — a bare sign-up has nothing to review.
   * Also used to edit & resubmit after 'changes_requested'.
   */
  async submitApplication(userId: string, d: { workspaceName: string; subjects: string[]; experienceYears: number; city: string; plannedStudents: number; sampleUrl?: string; idVerified?: boolean }) {
    await wait();
    if (!db.flags.tutorSignups) throw new ApiError('paused', 'New educator sign-ups are paused for a short while. Please try again soon.');
    const app = db.applications.find((a) => a.userId === userId && ['draft', 'changes_requested'].includes(a.status));
    if (!app) throw new ApiError('not_found', 'No application to complete. If yours is already submitted, our team is reviewing it.');
    const name = d.workspaceName.trim();
    if (name.length < 3) throw new ApiError('name', 'Give your academy a name (at least 3 characters).', 'workspaceName');
    const subjects = d.subjects.map((s) => s.trim()).filter(Boolean);
    if (!subjects.length) throw new ApiError('subjects', 'Add at least one subject you teach.', 'subjects');
    if (!(d.experienceYears > 0)) throw new ApiError('experience', 'Tell us your teaching experience in years.', 'experienceYears');
    if (!d.city.trim()) throw new ApiError('city', 'Which city are you based in?', 'city');
    if (!(d.plannedStudents > 0)) throw new ApiError('students', 'Roughly how many students do you plan to teach?', 'plannedStudents');
    if (d.sampleUrl && !/^https?:\/\/\S+\.\S+/.test(d.sampleUrl.trim())) throw new ApiError('sample', 'The sample should be a link (YouTube, Drive…).', 'sampleUrl');
    Object.assign(app, {
      workspaceName: name, subjects, experienceYears: Math.round(d.experienceYears), city: d.city.trim(),
      plannedStudents: Math.round(d.plannedStudents), sampleUrl: d.sampleUrl?.trim() || undefined,
      idVerified: d.idVerified ?? app.idVerified ?? false,
      status: 'submitted' as const, submittedAt: new Date().toISOString(), note: undefined,
    });
    persist();
    return { ...app };
  },

  async verifyResetOtp(target: string, code: string): Promise<{ resetToken: string }> {
    await wait();
    if (code !== DEMO_OTP) throw new ApiError('bad_otp', 'That code is not correct. Check the message and try again.', 'code');
    const u = findByIdentifier(target);
    if (!u) throw new ApiError('not_found', 'Account not found.');
    return { resetToken: u.id };
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    await wait();
    const u = db.users.find((x) => x.id === resetToken);
    if (!u) throw new ApiError('expired', 'This reset link has expired. Start again.');
    u.password = newPassword;
    persist();
  },

  /** Social sign-in. Real: Google/Apple OAuth → backend token exchange. POC signs into the demo student. */
  async socialSignIn(_provider: 'google' | 'apple'): Promise<Session> {
    await wait(600);
    return sessionFor('u_arjun');
  },

  getApplication(userId: string) {
    return db.applications.find((a) => a.userId === userId) ?? null;
  },

  /** Re-reads memberships (e.g. after Bodhin approves an educator). Real: token refresh. */
  refreshSession(userId: string): Session {
    return sessionFor(userId);
  },
};

export const tenants = {
  /** Production: server resolves host → tenant. POC: also accepts ?tenant=<slug> for demos. */
  resolve(hostname: string, override?: string | null): Tenant | null {
    if (override) return db.tenants.find((t) => t.slug === override) ?? null;
    const r = resolveHost(hostname);
    if (r.kind === 'subdomain') return db.tenants.find((t) => t.slug === r.slug) ?? null;
    if (r.kind === 'custom') return db.tenants.find((t) => t.customDomain === r.host) ?? null;
    return null;
  },
};

/* ───────────────────────── Catalog & learning (Step 2) ───────────────────────── */

const tutorOf = (c: Course) => seedTutors.find((t) => t.id === c.tutorId)!;

/**
 * Which courses a learner may SEE in browse/search:
 *  - Bodhin marketplace (no tenant): approved courses with public listing.
 *  - Tutor workspace: that tenant's approved courses (private ones too — the real
 *    backend additionally checks the learner belongs to that workspace).
 */
function visible(tenantId: string | null) {
  return seedCourses.filter((c) => (tenantId ? c.tenantId === tenantId && onWorkspace(c) : onMarketplace(c)));
}

export const catalog = {
  categories: () => (db.curation.categories ? db.curation.categories.filter((c) => !c.hidden) : seedCategories),
  /** Including hidden ones (course builder must still show a course's current category). */
  allCategories: () => db.curation.categories ?? seedCategories,
  tutor: (id: string) => seedTutors.find((t) => t.id === id) ?? null,

  async search(q: CourseQuery, tenantId: string | null) {
    await wait(220);
    const list = visible(tenantId).filter((c) => matchesQuery(c, q, tutorOf(c).name));
    return sortCourses(list, q.sort).map((c) => ({ course: c, tutor: tutorOf(c) }));
  },

  /** Explore landing: featured (promoted first), new, by collection. */
  async explore(tenantId: string | null) {
    await wait(250);
    const list = visible(tenantId);
    const promoted = list.filter((c) => c.visibility === 'public_promoted');
    // Marketplace: Super Admin curation (hero banners + featured order) comes first.
    const pick = (ids: string[]) => (tenantId ? [] : ids.map((id) => list.find((c) => c.id === id)).filter((c): c is Course => !!c));
    const heroes = pick(db.curation.banners);
    const feat = pick(db.curation.featured);
    const rest = sortCourses(list, 'relevance').filter((c) => !feat.includes(c));
    return {
      banners: (heroes.length ? heroes : promoted.length ? promoted : sortCourses(list, 'popular')).slice(0, 3),
      featured: [...feat, ...rest].slice(0, 6).map((c) => ({ course: c, tutor: tutorOf(c) })),
      all: list.map((c) => ({ course: c, tutor: tutorOf(c) })),
    };
  },

  get(id: string) {
    const c = seedCourses.find((x) => x.id === id);
    return c ? { course: c, tutor: tutorOf(c) } : null;
  },

  /** Every published course on the platform (staff tools only). */
  allCourses: () => seedCourses.filter((c) => c.status !== 'draft' && c.status !== 'archived'),

  isWishlisted: (userId: string, courseId: string) => db.wishlist.some((w) => w.userId === userId && w.courseId === courseId),
  toggleWishlist(userId: string, courseId: string) {
    const i = db.wishlist.findIndex((w) => w.userId === userId && w.courseId === courseId);
    i >= 0 ? db.wishlist.splice(i, 1) : db.wishlist.push({ userId, courseId });
    persist();
    return i < 0;
  },

  recentSearches: (userId: string) => db.recentSearches[userId] ?? [],
  saveSearch(userId: string, text: string) {
    const t = text.trim();
    if (!t) return;
    db.recentSearches[userId] = [t, ...(db.recentSearches[userId] ?? []).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    persist();
  },
  clearSearches(userId: string) {
    db.recentSearches[userId] = [];
    persist();
  },
};

export const learning = {
  /** Everything the Home tab needs in one call (one round-trip on slow mobile networks). */
  async home(userId: string, tenantId: string | null) {
    await wait(300);
    const mine = db.enrollments
      .filter((e) => e.userId === userId)
      .map((e) => {
        const course = seedCourses.find((c) => c.id === e.courseId)!;
        return { enrollment: e, course, tutor: tutorOf(course), progress: progressOf(course, e), next: nextLesson(course, e) };
      })
      .filter((x) => !tenantId || x.course.tenantId === tenantId)
      .sort((a, b) => (b.enrollment.lastActiveAt ?? '').localeCompare(a.enrollment.lastActiveAt ?? ''));

    const inProgress = mine.filter((m) => m.progress.pct < 100);
    const lessonsDone = mine.reduce((s, m) => s + m.progress.done, 0);
    const lessonsTotal = mine.reduce((s, m) => s + m.progress.total, 0);
    const myCourseIds = new Set(mine.map((m) => m.course.id));
    const now = Date.now();

    const batchLive = studentBatchSessions(userId).map(({ s }) => ({ id: s.id, courseId: db.batches.find((b) => b.id === s.batchId)!.courseId, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, registeredUserIds: [] as string[] }));
    const upcomingLive = [...seedLive.filter((s) => db.sessionStatus[s.id] !== 'cancelled'), ...batchLive]
      .filter((s) => myCourseIds.has(s.courseId) && new Date(s.endsAt).getTime() > now && db.sessionStatus[s.id] !== 'conducted' && db.classSessions.find((x) => x.id === s.id)?.status !== 'conducted')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((s) => ({ session: s, course: seedCourses.find((c) => c.id === s.courseId)!, registered: live.isRegistered(userId, s.id) }));

    const recommended = sortCourses(visible(tenantId).filter((c) => !myCourseIds.has(c.id)), 'relevance')
      .slice(0, 6)
      .map((c) => ({ course: c, tutor: tutorOf(c) }));

    return {
      enrolled: mine,
      inProgress,
      overallPct: lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
      completedCount: mine.length - inProgress.length,
      upcomingLive,
      recommended,
      counts: { assignmentsPending: assessments.pendingAssignments(userId), certificates: certificates.list(userId).length },
    };
  },

  isEnrolled: (userId: string, courseId: string) => db.enrollments.some((e) => e.userId === userId && e.courseId === courseId),
};

/* ───────────────────────── Course page, reviews, live, checkout (Step 3) ───────────────────────── */

export const reviews = {
  async list(courseId: string) {
    await wait(200);
    const c = seedCourses.find((x) => x.id === courseId)!;
    const mine = db.reviews.filter((r) => r.courseId === courseId);
    const list = [...mine, ...seedReviews.filter((r) => r.courseId === courseId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = c.ratingCount + mine.length;
    const avg = (c.rating * c.ratingCount + mine.reduce((s, r) => s + r.rating, 0)) / count;
    return { list, avg: Math.round(avg * 10) / 10, count, split: ratingSplit(c.rating, c.ratingCount, mine) };
  },
  mine: (userId: string, courseId: string) => db.reviews.find((r) => r.userId === userId && r.courseId === courseId) ?? null,
  async submit(input: Omit<Review, 'id' | 'createdAt'>) {
    await wait(500);
    if (!learning.isEnrolled(input.userId, input.courseId)) throw new ApiError('not_enrolled', 'Only enrolled learners can review this course.');
    if (input.text.trim().length < 20) throw new ApiError('too_short', 'Please write at least 20 characters so others find it useful.', 'text');
    const existing = db.reviews.findIndex((r) => r.userId === input.userId && r.courseId === input.courseId);
    const review: Review = { ...input, text: input.text.trim(), id: uid('rev'), createdAt: new Date().toISOString() };
    existing >= 0 ? (db.reviews[existing] = review) : db.reviews.push(review);
    persist();
    return review;
  },
};

export const live = {
  forCourse(courseId: string, userId: string) {
    return seedLive
      .filter((s) => s.courseId === courseId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((s) => ({ session: s, registered: live.isRegistered(userId, s.id) }));
  },
  isRegistered: (userId: string, sessionId: string) => db.liveRegistrations.some((r) => r.userId === userId && r.sessionId === sessionId),
  async toggleReminder(userId: string, sessionId: string) {
    await wait(250);
    const i = db.liveRegistrations.findIndex((r) => r.userId === userId && r.sessionId === sessionId);
    i >= 0 ? db.liveRegistrations.splice(i, 1) : db.liveRegistrations.push({ userId, sessionId });
    persist();
    return i < 0;
  },
};

export const commerce = {
  /** Price breakdown. Prices are GST-inclusive (shown as such at checkout). */
  quote(courseId: string, coupon?: string) {
    const c = seedCourses.find((x) => x.id === courseId)!;
    const code = coupon?.trim().toUpperCase();
    // Workspace coupons (created by the educator) are checked first, then Bodhin-wide demo codes.
    const wc = code ? db.coupons.find((x) => x.code === code && x.tenantId === c.tenantId) : undefined;
    if (wc) {
      const st = couponState(wc);
      if (st !== 'active') throw new ApiError('bad_coupon', st === 'expired' ? 'This offer has ended.' : st === 'used_up' ? 'This coupon has reached its usage limit.' : st === 'scheduled' ? 'This offer hasn’t started yet.' : 'This coupon is paused.', 'coupon');
      if (wc.courseIds.length && !wc.courseIds.includes(c.id)) throw new ApiError('bad_coupon', 'This coupon is not valid for this course.', 'coupon');
    }
    // Bodhin-wide promo codes are funded by Bodhin, so they only apply to Bodhin's own courses —
    // never to a tutor's course (that would cut the tutor's money without their consent).
    if (!wc && code && COUPONS[code] && c.tenantId !== db.platformConfig.bodhinTenantId) throw new ApiError('bad_coupon', 'This code is only valid on Bodhin’s own courses.', 'coupon');
    const rule = wc ? { pct: wc.type === 'pct' ? wc.value : 0, label: wc.type === 'pct' ? `${wc.value}% off` : `₹${wc.value.toLocaleString('en-IN')} off` } : code ? COUPONS[code] : undefined;
    if (code && !rule) throw new ApiError('bad_coupon', 'This coupon code is not valid for this course.', 'coupon');
    const discount = wc?.type === 'flat' ? Math.min(c.priceInr, wc.value) : rule ? Math.round((c.priceInr * rule.pct) / 100) : 0;
    const total = c.priceInr - discount;
    const gstIncluded = Math.round(total - total / 1.18);
    return { listInr: c.priceInr, discountInr: discount, totalInr: total, gstIncludedInr: gstIncluded, coupon: rule ? { code: code!, label: rule.label } : null };
  },

  /**
   * POC payment. Real: create order on backend → open Razorpay/Cashfree checkout → verify
   * signature server-side → webhook creates the enrollment. Demo card 4000 0000 0000 0002 fails.
   */
  /** Who collects this sale and how it splits (shown on checkout before paying). */
  route(courseId: string, checkoutTenantId: string | null, userId?: string) {
    const c = seedCourses.find((x) => x.id === courseId)!;
    const route = paymentRoute(c.tenantId, checkoutTenantId, db.platformConfig);
    const seller = db.tenants.find((t) => t.id === c.tenantId);
    const sellerName = route.collector === 'bodhin' ? 'Bodhin' : seller?.branding.displayName ?? tutorOf(c).name;
    // A tutor can sell directly only after connecting their own gateway.
    const directReady = route.collector === 'bodhin' || seller?.payments?.directGatewayStatus === 'active';
    // One reason the sale can't happen right now (shown on checkout before paying; pay() enforces the same).
    const blocked =
      enrolBlock(c.tenantId, userId ?? null) ??
      (!directReady ? 'This academy hasn’t finished payment setup yet. Please try again later.' : null) ??
      (route.channel === 'bodhin_marketplace' && !db.flags.marketplaceCheckout ? 'Marketplace checkout is paused for maintenance. Please try again shortly.' : null);
    return { ...route, sellerName, directReady, blocked };
  },

  /**
   * POC payment. Real: backend creates the order on the COLLECTOR's gateway (Bodhin's account for
   * bodhin_own / bodhin_marketplace, the tutor's connected account for tutor_direct) → client checkout →
   * server verifies signature → webhook creates the enrollment and the ledger entries.
   * Demo card 4000 0000 0000 0002 fails.
   */
  async pay(input: { userId: string; courseId: string; coupon?: string; method: PaymentMethod; source: Order['source']; checkoutTenantId: string | null; failDemo?: boolean }): Promise<Order> {
    await wait(1400);
    if (input.failDemo) throw new ApiError('payment_failed', 'Payment was declined by your bank. No money was taken. Try another method.');
    if (learning.isEnrolled(input.userId, input.courseId)) throw new ApiError('already', 'You are already enrolled in this course.');
    const r = commerce.route(input.courseId, input.checkoutTenantId, input.userId);
    if (r.blocked) {
      notifyCapFull(r.sellerTenantId, input.userId);
      throw new ApiError('not_open', r.blocked);
    }
    const q = commerce.quote(input.courseId, input.coupon);
    const split = splitOrder(q.totalInr, r, db.platformConfig);
    const now = new Date().toISOString();
    const order: Order = {
      id: uid('ord'),
      userId: input.userId,
      courseId: input.courseId,
      amountInr: q.totalInr,
      discountInr: q.discountInr,
      coupon: q.coupon?.code,
      method: input.method,
      status: 'paid',
      createdAt: now,
      invoiceNo: r.collector === 'bodhin' ? `BOD-INV-${new Date().getFullYear()}-${String(db.orders.length + 413).padStart(5, '0')}` : `${(db.tenants.find((t) => t.id === r.sellerTenantId)?.slug ?? 'edu').toUpperCase()}-${new Date().getFullYear()}-${String(db.orders.length + 300).padStart(4, '0')}`,
      source: input.source,
      commissionInr: split.commission,
      educatorShareInr: split.educatorNet,
      channel: r.channel,
      collector: r.collector,
      sellerTenantId: r.sellerTenantId,
      gatewayFeeInr: split.gatewayFee,
      payoutStatus: r.channel === 'bodhin_marketplace' ? 'on_hold' : 'not_applicable',
      payoutDate: r.channel === 'bodhin_marketplace' ? payoutDateFor(now, db.platformConfig) : undefined,
      buyerName: db.users.find((u) => u.id === input.userId)?.name,
    };
    db.orders.push(order);
    const usedCoupon = q.coupon && db.coupons.find((x) => x.code === q.coupon!.code && x.tenantId === seedCourses.find((cc) => cc.id === input.courseId)!.tenantId);
    if (usedCoupon) usedCoupon.used += 1;
    enroll(input.userId, input.courseId, input.source);
    // Receipts: buyer gets the invoice note; the academy owner hears about the sale.
    const course = seedCourses.find((cc) => cc.id === input.courseId)!;
    notifyUser(input.userId, 'course', 'You’re enrolled 🎉', `“${course.title}” is in your Learn tab. Invoice ${order.invoiceNo}.`, { pathname: '/learn' });
    const sellerOwner = db.tenants.find((t) => t.id === r.sellerTenantId)?.ownerUserId;
    if (sellerOwner && sellerOwner !== input.userId) notifyUser(sellerOwner, 'system', 'New enrolment 🎉', `${order.buyerName ?? 'A learner'} bought “${course.title}” (₹${q.totalInr.toLocaleString('en-IN')}${r.channel === 'bodhin_marketplace' ? ' · via Bodhin marketplace' : ''}).`, { pathname: '/edu/earnings' });
    persist();
    return order;
  },

  async enrollFree(userId: string, courseId: string, source: Order['source']) {
    await wait(500);
    const c = seedCourses.find((x) => x.id === courseId)!;
    if (c.priceInr !== 0) throw new ApiError('not_free', 'This course is paid.');
    const block = enrolBlock(c.tenantId, userId);
    if (block) {
      notifyCapFull(c.tenantId, userId);
      throw new ApiError('not_open', block);
    }
    enroll(userId, courseId, source);
  },
};

/** Learner already counts as an active student of this workspace (no new seat needed). */
function isActiveStudentOf(userId: string, tenantId: string) {
  return db.enrollments.some((e) => e.userId === userId && seedCourses.find((c) => c.id === e.courseId)?.tenantId === tenantId && (!e.validTill || new Date(e.validTill).getTime() > Date.now()));
}
/** Active-student limit check for a workspace (100% policy: new enrolments pause, existing students unaffected). */
function studentCapFull(tenantId: string, userId: string | null) {
  const t = db.tenants.find((x) => x.id === tenantId);
  const u = db.usage[tenantId];
  if (!t || !u || (userId && isActiveStudentOf(userId, tenantId))) return false;
  const sub = t.subscription ?? { plan: t.plan, status: 'active' as const, billing: 'monthly' as const, periodEnd: '', addons: [] };
  const lim = entitlements(sub).limits.activeStudents;
  return lim != null && u.activeStudents >= lim;
}
/** Why a learner can't enrol in this workspace right now (null = open). */
function enrolBlock(tenantId: string, userId: string | null) {
  if (db.tenants.find((t) => t.id === tenantId)?.status === 'suspended') return 'This academy is not accepting new enrolments right now.';
  if (studentCapFull(tenantId, userId)) return 'This academy isn’t taking new enrolments right now. Please try again later.';
  return null;
}
/** Tell the owner a learner was turned away by the student limit (once until they read it). */
function notifyCapFull(tenantId: string, userId: string) {
  const t = db.tenants.find((x) => x.id === tenantId);
  if (!t?.ownerUserId || !studentCapFull(tenantId, userId)) return;
  const title = 'A learner couldn’t enrol: student limit reached';
  if (db.notifications.some((n) => n.userId === t.ownerUserId && n.title === title && !n.read)) return;
  notifyUser(t.ownerUserId, 'system', title, 'Your plan’s active-student limit is full, so new enrolments are paused. Add a student block or upgrade to reopen them.', { pathname: '/edu/subscription' });
  persist();
}

function enroll(userId: string, courseId: string, source: Order['source']) {
  if (db.enrollments.some((e) => e.userId === userId && e.courseId === courseId)) return;
  // A new learner for this workspace takes one active-student seat.
  const tid = seedCourses.find((c) => c.id === courseId)?.tenantId;
  if (tid && db.usage[tid] && !isActiveStudentOf(userId, tid)) db.usage[tid].activeStudents += 1;
  const until = new Date();
  until.setFullYear(until.getFullYear() + 1);
  db.enrollments.push({ userId, courseId, enrolledAt: new Date().toISOString(), validTill: until.toISOString(), completedLessonIds: [], lastActiveAt: new Date().toISOString(), source });
  persist();
}

export const enrollment = {
  get: (userId: string, courseId: string) => db.enrollments.find((e) => e.userId === userId && e.courseId === courseId) ?? null,
};

/* ───────────────────────── Player, notes, Q&A, downloads (Step 4) ───────────────────────── */

/** Video sizes per quality (MB per minute) — used to estimate download sizes. */
const MB_PER_MIN = { sd: 4, hd: 11 } as const;

export const player = {
  /**
   * Everything the player needs. Real backend also returns a short-lived signed HLS URL here
   * (private object storage + controlled delivery, per the architecture blueprint).
   */
  open(userId: string, courseId: string, lessonId?: string) {
    const course = seedCourses.find((c) => c.id === courseId);
    if (!course) throw new ApiError('not_found', 'Course not found.');
    const e = db.enrollments.find((x) => x.userId === userId && x.courseId === courseId);
    const lessons = allLessons(course);
    const lesson = lessons.find((l) => l.id === lessonId) ?? (e ? nextLesson(course, e).lesson : lessons[0]);
    if (!e && !lesson.preview) throw new ApiError('locked', 'Enroll in this course to watch this lesson.');
    const i = lessons.indexOf(lesson);
    const module = course.modules.find((m) => m.lessons.includes(lesson))!;
    if (e) {
      e.lastLessonId = lesson.id;
      e.lastActiveAt = new Date().toISOString();
      persist();
    }
    return {
      course,
      tutor: tutorOf(course),
      module,
      lesson,
      index: i,
      prev: lessons[i - 1] ?? null,
      next: lessons[i + 1] ?? null,
      enrolled: !!e,
      completed: new Set(e?.completedLessonIds ?? []),
      position: db.positions[`${userId}:${lesson.id}`] ?? 0,
      streamUrl: `https://media.thebodhin.com/hls/${lesson.id}/master.m3u8?sig=demo`, // placeholder
    };
  },

  savePosition(userId: string, lessonId: string, sec: number) {
    db.positions[`${userId}:${lessonId}`] = Math.floor(sec);
    persist();
  },

  setComplete(userId: string, courseId: string, lessonId: string, done = true) {
    const e = db.enrollments.find((x) => x.userId === userId && x.courseId === courseId);
    if (!e) return;
    const has = e.completedLessonIds.includes(lessonId);
    if (done && !has) e.completedLessonIds.push(lessonId);
    if (!done && has) e.completedLessonIds = e.completedLessonIds.filter((x) => x !== lessonId);
    e.lastActiveAt = new Date().toISOString();
    persist();
  },

  isBookmarked: (userId: string, lessonId: string) => db.bookmarks.some((b) => b.userId === userId && b.lessonId === lessonId),
  toggleBookmark(userId: string, lessonId: string) {
    const i = db.bookmarks.findIndex((b) => b.userId === userId && b.lessonId === lessonId);
    i >= 0 ? db.bookmarks.splice(i, 1) : db.bookmarks.push({ userId, lessonId });
    persist();
    return i < 0;
  },
};

export const notes = {
  list: (userId: string, lessonId: string) => db.notes.filter((n) => n.userId === userId && n.lessonId === lessonId).sort((a, b) => a.atSec - b.atSec),
  add(input: { userId: string; courseId: string; lessonId: string; atSec: number; text: string }) {
    const t = input.text.trim();
    if (!t) throw new ApiError('empty', 'Write something first.');
    const n = { ...input, text: t, id: uid('note'), createdAt: new Date().toISOString() };
    db.notes.push(n);
    persist();
    return n;
  },
  remove(id: string) {
    db.notes = db.notes.filter((n) => n.id !== id);
    persist();
  },
};

export const questions = {
  list: (lessonId: string) => db.questions.filter((q) => q.lessonId === lessonId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  async ask(input: { courseId: string; lessonId: string; userId: string; userName: string; text: string }) {
    await wait(400);
    if (input.text.trim().length < 10) throw new ApiError('short', 'Add a little more detail so the tutor can help (10+ characters).');
    const q = { ...input, text: input.text.trim(), id: uid('qa'), createdAt: new Date().toISOString() };
    db.questions.push(q);
    persist();
    return q;
  },
};

export const downloads = {
  estimateMb(lessonId: string, quality: 'sd' | 'hd') {
    const l = seedCourses.flatMap(allLessons).find((x) => x.id === lessonId);
    if (!l) return 0;
    if (l.type === 'pdf') return l.sizeMb ?? 1;
    return Math.round(((l.durationSec ?? 0) / 60) * MB_PER_MIN[quality]);
  },
  has: (userId: string, lessonId: string) => db.downloads.some((d) => d.userId === userId && d.lessonId === lessonId),
  /**
   * POC: simulates a download with progress callbacks.
   * Real (native): expo-file-system resumable download of an encrypted, licence-bound file
   * that only plays inside the app (no raw MP4 in the gallery).
   */
  start(userId: string, courseId: string, lessonId: string, quality: 'sd' | 'hd', onProgress: (pct: number) => void) {
    let pct = 0;
    let cancelled = false;
    const done = new Promise<void>((resolve) => {
      const tick = () => {
        if (cancelled) return resolve();
        pct = Math.min(100, pct + 8 + Math.random() * 14);
        onProgress(Math.round(pct));
        if (pct >= 100) {
          if (!downloads.has(userId, lessonId)) db.downloads.push({ userId, courseId, lessonId, sizeMb: downloads.estimateMb(lessonId, quality), quality, savedAt: new Date().toISOString() });
          persist();
          return resolve();
        }
        setTimeout(tick, 260);
      };
      setTimeout(tick, 200);
    });
    return { done, cancel: () => (cancelled = true) };
  },
  remove(userId: string, lessonIds: string[]) {
    db.downloads = db.downloads.filter((d) => !(d.userId === userId && lessonIds.includes(d.lessonId)));
    persist();
  },
  list(userId: string) {
    const mine = db.downloads.filter((d) => d.userId === userId);
    const byCourse = new Map<string, { course: Course; items: { lesson: ReturnType<typeof allLessons>[number]; sizeMb: number; quality: 'sd' | 'hd'; savedAt: string }[] }>();
    for (const d of mine) {
      const course = seedCourses.find((c) => c.id === d.courseId);
      const lesson = course && allLessons(course).find((l) => l.id === d.lessonId);
      if (!course || !lesson) continue;
      if (!byCourse.has(course.id)) byCourse.set(course.id, { course, items: [] });
      byCourse.get(course.id)!.items.push({ lesson, sizeMb: d.sizeMb, quality: d.quality, savedAt: d.savedAt });
    }
    return { groups: [...byCourse.values()], usedMb: mine.reduce((s, d) => s + d.sizeMb, 0) };
  },
};

/* ───────────────────────── Live tab & room (Step 5) ───────────────────────── */
/** Recording of a finished class: 'ready' (playable), 'processing' (published, file not ready yet) or 'none'. Real: `recording_path` + signed URL. */
function recordingState(sessionId: string): { state: 'ready' | 'processing' | 'unavailable' | 'none'; url?: string } {
  const sum = db.sessionSummaries[sessionId];
  if (sum?.recordingPublished && sum.recordingUrl) return { state: 'ready', url: sum.recordingUrl };
  const row = db.classSessions.find((x) => x.id === sessionId);
  const recorded = !!(sum?.recordingPublished || row?.recording);
  if (!recorded) return { state: 'none' };
  // recorded but no file yet: still being prepared for 48 hours, after that the file is considered missing
  const endedAt = new Date(sum?.endedAt ?? row?.endsAt ?? 0).getTime();
  return Date.now() - endedAt < 48 * 36e5 ? { state: 'processing' } : { state: 'unavailable' };
}
/**
 * The ONE place a learner's attendance for a class is worked out — the list and the recording page both use it,
 * so they can never disagree. A batch class marked present/late by the educator counts as the full class length.
 */
function attendanceFor(userId: string, sessionId: string) {
  const own = db.attendance.find((a) => a.userId === userId && a.sessionId === sessionId) ?? null;
  const batch = studentBatchSessions(userId).find((x) => x.s.id === sessionId);
  if (batch?.mark && batch.mark.status !== 'absent' && !(own && own.minutes > 0)) return { userId, sessionId, minutes: Math.round(hoursOf(batch.s) * 60), joinedAt: batch.s.startsAt };
  return own;
}
/** A learner counts as present once they actually stayed (≥ 1 minute), not just opened the room. */
const stayed = (a: { minutes: number } | null | undefined) => !!a && a.minutes >= 1;

export const liveTab = {
  /** Upcoming + live + past (with attendance) for courses the learner is enrolled in. */
  async schedule(userId: string, tenantId: string | null) {
    await wait(250);
    const mine = new Set(db.enrollments.filter((e) => e.userId === userId).map((e) => e.courseId));
    const now = Date.now();
    const courseRows = seedLive
      .filter((s) => mine.has(s.courseId) && db.sessionStatus[s.id] !== 'cancelled')
      .map((s) => {
        const course = seedCourses.find((c) => c.id === s.courseId)!;
        const attendance = attendanceFor(userId, s.id);
        return { session: s, course, tutor: tutorOf(course), reminder: live.isRegistered(userId, s.id), attendance, attended: stayed(attendance), recording: recordingState(s.id) };
      });
    // Batch classes the learner belongs to (scheduled by their educator) — same data the educator sees.
    const batchRows = studentBatchSessions(userId).map(({ s, mark }) => {
      const b = db.batches.find((x) => x.id === s.batchId)!;
      const course = seedCourses.find((c) => c.id === b.courseId)!;
      const session = { id: s.id, courseId: b.courseId, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, registeredUserIds: [] };
      const attendance = attendanceFor(userId, s.id);
      return { session, course, tutor: tutorOf(course), reminder: true, attendance, attended: stayed(attendance), recording: recordingState(s.id) };
    });
    const rows = [...courseRows, ...batchRows].filter((r) => !tenantId || r.course.tenantId === tenantId);
    // A class the host has ended counts as past even if its scheduled end time hasn't arrived.
    const ended = (id: string) => db.sessionStatus[id] === 'conducted' || db.classSessions.find((x) => x.id === id)?.status === 'conducted';
    const liveNow = rows.filter((r) => !ended(r.session.id) && new Date(r.session.startsAt).getTime() <= now && new Date(r.session.endsAt).getTime() > now);
    const upcoming = rows.filter((r) => !ended(r.session.id) && new Date(r.session.startsAt).getTime() > now).sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
    const past = rows.filter((r) => ended(r.session.id) || new Date(r.session.endsAt).getTime() <= now).sort((a, b) => b.session.startsAt.localeCompare(a.session.startsAt));
    const attended = past.filter((p) => p.attended).length;
    return {
      liveNow,
      upcoming,
      past,
      stats: { total: past.length, attended, missed: past.length - attended, pct: past.length ? Math.round((attended / past.length) * 1000) / 10 : 0 },
      calendarSync: !!db.calendarSync[userId],
    };
  },

  setCalendarSync(userId: string, on: boolean) {
    db.calendarSync[userId] = on;
    persist();
  },

  session(id: string) {
    const cs = db.classSessions.find((x) => x.id === id);
    const s = seedLive.find((x) => x.id === id) ?? (cs ? { id: cs.id, courseId: db.batches.find((b) => b.id === cs.batchId)!.courseId, title: cs.title, startsAt: cs.startsAt, endsAt: cs.endsAt, registeredUserIds: [] } : undefined);
    if (!s) return null;
    const course = seedCourses.find((c) => c.id === s.courseId)!;
    return { session: s, course, tutor: tutorOf(course) };
  },

  /**
   * Join a live room. Real: backend checks tenant + enrolment, then returns a short-lived
   * room token from the conferencing provider (LiveKit or BigBlueButton adapter).
   */
  async join(userId: string, sessionId: string) {
    await wait(400);
    const s = liveTab.session(sessionId)?.session;
    if (!s) throw new ApiError('not_found', 'This class could not be found.');
    if (!db.flags.liveClasses) throw new ApiError('paused', 'Live classes are temporarily unavailable. Please try again in a few minutes.');
    if (db.sessionStatus[sessionId] === 'conducted' || db.classSessions.find((x) => x.id === sessionId)?.status === 'conducted') throw new ApiError('ended', 'This class has ended. The recording will be in Past & Attendance.');
    if (!learning.isEnrolled(userId, s.courseId)) throw new ApiError('not_enrolled', 'Only enrolled learners can join this class.');
    const win = joinWindow(new Date(s.startsAt).getTime(), new Date(s.endsAt).getTime());
    if (win === 'too_early') throw new ApiError('too_early', 'The room opens 10 minutes before the class starts.');
    if (win === 'ended') throw new ApiError('ended', 'This class has ended. The recording will be in Past & Attendance.');
    if (!db.attendance.some((a) => a.userId === userId && a.sessionId === sessionId)) {
      db.attendance.push({ userId, sessionId, minutes: 0, joinedAt: new Date().toISOString() });
      persist();
    }
    const user = db.users.find((u) => u.id === userId);
    /**
     * Mock: 'loopback' room (a host tab and a learner tab on one device talk to each other; no media server).
     * Real backend: POST supabase/functions/live-token → { provider: 'livekit', url, token, role, record } (docs/LIVE_CLASSES.md).
     * `speakAllowed` is true after the host approved this learner's raised hand (real: live_speakers row).
     */
    return {
      provider: 'loopback' as 'loopback' | 'livekit',
      url: '',
      token: uid('room'),
      name: user?.name ?? 'Learner',
      speakAllowed: speakers.has(`${sessionId}:${userId}`),
      record: (liveAdmin.settingsOf(sessionId)?.record ?? true) as boolean,
    };
  },

  /** Called every minute while the learner is in the room, so attendance reflects time actually spent (real: live_ping). */
  heartbeat(userId: string, sessionId: string) {
    const a = db.attendance.find((x) => x.userId === userId && x.sessionId === sessionId);
    const s = liveTab.session(sessionId)?.session;
    if (!a || !s) return;
    const cap = Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 6e4) + 30;
    a.minutes = Math.min(cap, a.minutes + 1);
    persist();
  },

  /** Leaving never adds more than the learner really stayed; the heartbeat already counted whole minutes. */
  leave(userId: string, sessionId: string, minutes: number) {
    const a = db.attendance.find((x) => x.userId === userId && x.sessionId === sessionId);
    const s = liveTab.session(sessionId)?.session;
    if (a && s) {
      const cap = Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 6e4) + 30;
      a.minutes = Math.min(cap, Math.max(a.minutes, Math.round(minutes)));
      persist();
    }
  },

  /** A past class for the recording page: recording state, chapters, shared files and the learner's own attendance. */
  recording(userId: string, sessionId: string) {
    const info = liveTab.session(sessionId);
    if (!info) return null;
    const enrolled = learning.isEnrolled(userId, info.session.courseId) || studentBatchSessions(userId).some((x) => x.s.id === sessionId);
    if (!enrolled) return null;
    const sum = db.sessionSummaries[sessionId] ?? null;
    const a = attendanceFor(userId, sessionId);
    return { ...info, recording: recordingState(sessionId), chapters: sum?.chapters ?? [], materials: sum?.materials ?? [], attendance: a, attended: stayed(a) };
  },
};

/** Learners the host has allowed to speak: `${sessionId}:${userId}` (real: live_speakers). */
const speakers = new Set<string>();

/* ───────────────────────── Assessments (Step 6) ───────────────────────── */

const questionsOf = (a: Assessment) => (a.questionIds ?? []).map((id) => QUESTIONS.find((q) => q.id === id)!).filter(Boolean);
const bestAttempt = (userId: string, assessmentId: string) =>
  db.attempts.filter((t) => t.userId === userId && t.assessmentId === assessmentId).sort((a, b) => b.scorePct - a.scorePct || b.submittedAt.localeCompare(a.submittedAt))[0] ?? null;
const latestAttempt = (userId: string, assessmentId: string) =>
  db.attempts.filter((t) => t.userId === userId && t.assessmentId === assessmentId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null;

function statusOf(userId: string, a: Assessment): AssessStatus {
  const now = Date.now();
  if (a.kind === 'assignment') {
    const s = db.submissions.find((x) => x.userId === userId && x.assessmentId === a.id);
    if (s?.status === 'graded') return 'graded';
    if (s?.status === 'submitted') return 'submitted';
    if (a.dueAt && new Date(a.dueAt).getTime() < now) return 'overdue';
    return s ? 'in_progress' : 'pending';
  }
  if (a.opensAt && new Date(a.opensAt).getTime() > now) return 'scheduled';
  return bestAttempt(userId, a.id) ? 'completed' : 'pending';
}

export const assessments = {
  async list(userId: string, tenantId: string | null) {
    await wait(250);
    const mine = new Set(db.enrollments.filter((e) => e.userId === userId).map((e) => e.courseId));
    // Curriculum quizzes appear once the learner reaches that module (not the whole course at once).
    const reached = (a: Assessment) => {
      if (!a.lessonId) return true;
      const c = seedCourses.find((x) => x.id === a.courseId)!;
      const e = db.enrollments.find((x) => x.userId === userId && x.courseId === a.courseId);
      const nextMod = c.modules.indexOf(nextLesson(c, e).module);
      const quizMod = c.modules.findIndex((m) => m.lessons.some((l) => l.id === a.lessonId));
      return quizMod <= nextMod || !!bestAttempt(userId, a.id);
    };
    const myBatches = new Set(db.people.filter((p) => p.userId === userId).flatMap((p) => p.courses.map((c) => c.batchId).filter(Boolean)));
    const forMe = (a: Assessment) => a.status !== 'draft' && (!a.batchId || myBatches.has(a.batchId));
    const rows = ASSESSMENTS.filter((a) => mine.has(a.courseId) && forMe(a) && reached(a))
      .map((a) => {
        const course = seedCourses.find((c) => c.id === a.courseId)!;
        const best = a.kind === 'assignment' ? null : bestAttempt(userId, a.id);
        const sub = a.kind === 'assignment' ? db.submissions.find((x) => x.userId === userId && x.assessmentId === a.id) ?? null : null;
        return { a, course, status: statusOf(userId, a), best, sub };
      })
      .filter((r) => !tenantId || r.course.tenantId === tenantId);
    const order: Record<AssessStatus, number> = { overdue: 0, in_progress: 1, pending: 2, scheduled: 3, submitted: 4, graded: 5, completed: 6 };
    rows.sort((x, y) => order[x.status] - order[y.status] || (x.a.dueAt ?? 'z').localeCompare(y.a.dueAt ?? 'z'));
    const scored = rows.map((r) => r.best?.scorePct ?? r.sub?.grade?.pct).filter((x): x is number => x != null);
    const done = rows.filter((r) => ['completed', 'graded', 'submitted'].includes(r.status)).length;
    return {
      rows,
      stats: { total: rows.length, done, pending: rows.filter((r) => ['pending', 'in_progress', 'overdue'].includes(r.status)).length, avg: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0 },
    };
  },

  pendingAssignments(userId: string) {
    const mine = new Set(db.enrollments.filter((e) => e.userId === userId).map((e) => e.courseId));
    return ASSESSMENTS.filter((a) => a.kind === 'assignment' && a.status !== 'draft' && mine.has(a.courseId) && ['pending', 'in_progress', 'overdue'].includes(statusOf(userId, a))).length;
  },

  get(id: string) {
    const a = ASSESSMENTS.find((x) => x.id === id || x.lessonId === id);
    if (!a) return null;
    return { a, course: seedCourses.find((c) => c.id === a.courseId)!, tutor: tutorOf(seedCourses.find((c) => c.id === a.courseId)!) };
  },

  /** Starts an attempt. Real backend serves questions WITHOUT the correct answers and scores on submit. */
  start(userId: string, id: string) {
    const found = assessments.get(id);
    if (!found) throw new ApiError('not_found', 'This assessment could not be found.');
    if (!learning.isEnrolled(userId, found.a.courseId)) throw new ApiError('not_enrolled', 'Enroll in the course to take this assessment.');
    if (statusOf(userId, found.a) === 'scheduled') throw new ApiError('scheduled', `This exam opens on ${new Date(found.a.opensAt!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`);
    const max = found.a.settings?.attempts ?? 0;
    if (max > 0 && db.attempts.filter((t) => t.userId === userId && t.assessmentId === found.a.id).length >= max) throw new ApiError('attempts', `You’ve used all ${max} attempt${max > 1 ? 's' : ''} for this ${found.a.kind}.`);
    return { ...found, questions: questionsOf(found.a), previous: latestAttempt(userId, found.a.id) };
  },

  async submit(userId: string, assessmentId: string, answers: number[], startedAt: number): Promise<Attempt> {
    await wait(700);
    const a = ASSESSMENTS.find((x) => x.id === assessmentId)!;
    const s = scoreQuiz(questionsOf(a), answers, a.marks);
    const of = 48;
    const rank = Math.max(1, Math.round(of * (1 - s.scorePct / 100) * 0.9) + 1);
    const t: Attempt = { id: uid('att'), userId, assessmentId, answers, startedAt: new Date(startedAt).toISOString(), submittedAt: new Date().toISOString(), timeTakenSec: Math.round((Date.now() - startedAt) / 1000), ...s, rank, of };
    db.attempts.push(t);
    // Passing a curriculum quiz completes that lesson.
    if (a.lessonId && s.scorePct >= a.passPct) player.setComplete(userId, a.courseId, a.lessonId, true);
    persist();
    return t;
  },

  attempt(id: string) {
    const t = db.attempts.find((x) => x.id === id);
    if (!t) return null;
    const a = ASSESSMENTS.find((x) => x.id === t.assessmentId)!;
    return { t, a, course: seedCourses.find((c) => c.id === a.courseId)!, questions: questionsOf(a), best: bestAttempt(t.userId, a.id) };
  },

  latest: latestAttempt,
  statusOf,

  submission(userId: string, assessmentId: string): Submission | null {
    return db.submissions.find((x) => x.userId === userId && x.assessmentId === assessmentId) ?? null;
  },

  async saveSubmission(userId: string, assessmentId: string, patch: Pick<Submission, 'files' | 'link' | 'note'>, submit: boolean) {
    await wait(submit ? 900 : 400);
    const a = ASSESSMENTS.find((x) => x.id === assessmentId)!;
    if (submit && !patch.files.length && !patch.link?.trim()) throw new ApiError('empty', 'Add a file or a link before submitting.');
    if (patch.link && !/^https?:\/\/\S+\.\S+/.test(patch.link.trim())) throw new ApiError('bad_link', 'Enter a full link starting with https://', 'link');
    const tooBig = patch.files.find((f) => f.sizeMb > (a.maxMb ?? 50));
    if (tooBig) throw new ApiError('too_big', `${tooBig.name} is larger than ${a.maxMb} MB.`);
    let s = db.submissions.find((x) => x.userId === userId && x.assessmentId === assessmentId);
    if (s?.status === 'graded') throw new ApiError('graded', 'This assignment is already graded.');
    const now = new Date().toISOString();
    if (!s) {
      s = { id: uid('sub'), userId, assessmentId, status: 'draft', files: [], note: '', updatedAt: now };
      db.submissions.push(s);
    }
    Object.assign(s, patch, { updatedAt: now });
    if (submit) Object.assign(s, { status: 'submitted', submittedAt: now, returnNote: undefined });
    persist();
    return { ...s };
  },
};

/* ───────────────────────── Profile, payments, certificates, help, notifications (Step 7) ───────────────────────── */
const DEFAULT_SETTINGS = { push: { live: true, assignments: true, course: true, offers: false }, wifiOnly: true, quality: 'auto' as const, language: 'en' as const };

export const account = {
  async summary(userId: string) {
    await wait(200);
    const enr = db.enrollments.filter((e) => e.userId === userId);
    const done = enr.filter((e) => {
      const c = seedCourses.find((x) => x.id === e.courseId)!;
      return progressOf(c, e).pct === 100;
    }).length;
    const lessonsDone = enr.reduce((s, e) => s + e.completedLessonIds.length, 0);
    const lessonsTotal = enr.reduce((s, e) => s + allLessons(seedCourses.find((x) => x.id === e.courseId)!).length, 0);
    return {
      enrolled: enr.length,
      completed: done,
      certificates: certificates.list(userId).length,
      achievements: badges.list(userId).filter((b) => b.earned).length,
      pct: lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
      unread: db.notifications.filter((n) => n.userId === userId && !n.read).length,
    };
  },
  async updateProfile(userId: string, patch: { name: string; email: string }) {
    await wait(400);
    const u = db.users.find((x) => x.id === userId)!;
    if (patch.name.trim().length < 2) throw new ApiError('name', 'Enter your full name.', 'name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.email.trim())) throw new ApiError('email', 'Enter a valid email address.', 'email');
    if (db.users.some((x) => x.id !== userId && x.email === patch.email.trim().toLowerCase())) throw new ApiError('email_taken', 'Another account uses this email.', 'email');
    u.name = patch.name.trim();
    u.email = patch.email.trim().toLowerCase();
    persist();
    return sessionFor(userId);
  },
  async changePassword(userId: string, current: string, next: string) {
    await wait(500);
    const u = db.users.find((x) => x.id === userId)!;
    if (u.password !== current) throw new ApiError('bad_password', 'Your current password is incorrect.', 'current');
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) throw new ApiError('weak', 'Use at least 8 characters with letters and numbers.', 'next');
    u.password = next;
    persist();
  },
  settings: (userId: string) => db.settings[userId] ?? DEFAULT_SETTINGS,
  saveSettings(userId: string, s: typeof DEFAULT_SETTINGS | (typeof db.settings)[string]) {
    db.settings[userId] = s;
    persist();
  },
  async sendFeedback(userId: string, rating: number, text: string) {
    await wait(400);
    db.feedback.push({ userId, rating, text, at: new Date().toISOString() });
    persist();
  },
};

export const payments = {
  async list(userId: string) {
    await wait(250);
    const orders = db.orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const rows = orders.map((o) => ({ order: o, course: seedCourses.find((c) => c.id === o.courseId)!, enrollment: db.enrollments.find((e) => e.userId === userId && e.courseId === o.courseId) ?? null }));
    const enr = db.enrollments.filter((e) => e.userId === userId);
    return {
      rows,
      enrollments: enr.map((e) => ({ e, course: seedCourses.find((c) => c.id === e.courseId)!, progress: progressOf(seedCourses.find((c) => c.id === e.courseId)!, e) })),
      stats: { enrollments: enr.length, active: enr.filter((e) => !e.validTill || new Date(e.validTill).getTime() > Date.now()).length, totalPaid: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amountInr, 0) },
    };
  },
  async emailInvoice(_orderId: string) {
    await wait(600);
    return { sentTo: db.users[0].email };
  },

  /** Days left in the refund window for an order (0 = window closed). */
  refundWindow(o: Order) {
    const end = new Date(o.createdAt).getTime() + db.platformConfig.refundHoldDays * 864e5;
    return { days: db.platformConfig.refundHoldDays, open: o.status === 'paid' && end > Date.now(), daysLeft: Math.max(0, Math.ceil((end - Date.now()) / 864e5)), pending: db.refundRequests.some((r) => r.orderId === o.id && r.status === 'open'), decided: db.refundRequests.find((r) => r.orderId === o.id && r.status !== 'open')?.status ?? null };
  },

  /** Learner asks for a refund (within the refund window). Finance decides it in the Super Admin portal. */
  async requestRefund(userId: string, orderId: string, reason: string) {
    await wait();
    const o = db.orders.find((x) => x.id === orderId && x.userId === userId);
    if (!o) throw new ApiError('not_found', 'Order not found.');
    if (o.status !== 'paid') throw new ApiError('not_paid', 'Only paid orders can be refunded.');
    if (db.refundRequests.some((r) => r.orderId === orderId && r.status === 'open')) throw new ApiError('pending', 'A refund request for this order is already being reviewed.');
    const w = payments.refundWindow(o);
    if (!w.open) throw new ApiError('window', `The ${db.platformConfig.refundHoldDays}-day refund window for this order has closed.`);
    if (reason.trim().length < 10) throw new ApiError('reason', 'Tell us briefly why (at least 10 characters) — it helps the review.', 'reason');
    const u = db.users.find((x) => x.id === userId)!;
    const c = seedCourses.find((x) => x.id === o.courseId);
    const tenantId = o.sellerTenantId ?? c?.tenantId ?? 't_bodhin';
    db.refundRequests.push({ id: uid('rf'), orderId, tenantId, buyer: u.name, course: c?.title ?? o.courseId, amountInr: o.amountInr, reason: reason.trim(), at: new Date().toISOString(), status: 'open' });
    // Who decides depends on who collected the money: direct sale → the academy; otherwise → Bodhin Finance.
    const academy = db.tenants.find((t) => t.id === tenantId);
    const direct = o.channel === 'tutor_direct';
    notifyUser(userId, 'system', 'Refund request received', `${direct ? academy?.branding.displayName ?? 'The academy' : 'Bodhin'} is reviewing your request for “${c?.title}”. Most decisions take 1–2 working days.`, { pathname: '/payments' });
    if (direct && academy?.ownerUserId) notifyUser(academy.ownerUserId, 'system', 'Refund request on a direct sale', `${u.name} asked for a refund on “${c?.title}” (₹${o.amountInr.toLocaleString('en-IN')}). Review it in Earnings.`, { pathname: '/edu/earnings' });
    persist();
  },
};

export const certificates = {
  /** Seeded certificates + one auto-issued for every completed course that offers a certificate. */
  list(userId: string) {
    const issued = db.certificates.filter((c) => c.userId === userId);
    const auto = db.enrollments
      .filter((e) => e.userId === userId)
      .map((e) => ({ e, c: seedCourses.find((x) => x.id === e.courseId)! }))
      .filter(({ e, c }) => c.certificate && progressOf(c, e).pct === 100 && !issued.some((i) => i.courseId === c.id))
      .map(({ c }) => ({ id: `BODHIN-${c.id.slice(2, 6).toUpperCase()}-${new Date().getFullYear()}-${String(500 + c.id.length).padStart(4, '0')}`, userId, courseId: c.id, title: c.title, program: 'Course Completion', issuedAt: new Date().toISOString(), weeks: Math.max(2, Math.round(allLessons(c).length / 4)), tutor: tutorOf(c).name }));
    return [...auto, ...issued].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  },
  get: (userId: string, id: string) => certificates.list(userId).find((c) => c.id === id) ?? null,
  /** Public verification (anyone with the ID). Real: GET thebodhin.com/verify/<id>. */
  async verify(id: string) {
    await wait(500);
    const all = [...new Set(db.users.map((u) => u.id))].flatMap((u) => certificates.list(u));
    const c = all.find((x) => x.id.toUpperCase() === id.trim().toUpperCase());
    if (!c) return { valid: false as const };
    return { valid: true as const, name: db.users.find((u) => u.id === c.userId)?.name ?? 'Learner', title: c.title, issuedAt: c.issuedAt };
  },
  verifyUrl: (id: string) => `https://thebodhin.com/verify/${id}`,
};

export const badges = {
  list(userId: string) {
    const best = Math.max(0, ...db.attempts.filter((a) => a.userId === userId).map((a) => a.scorePct));
    const topRank = Math.min(99, ...db.attempts.filter((a) => a.userId === userId).map((a) => a.rank));
    const past = seedLive.filter((s) => new Date(s.endsAt).getTime() < Date.now() && db.enrollments.some((e) => e.userId === userId && e.courseId === s.courseId));
    const att = past.length ? db.attendance.filter((a) => a.userId === userId && past.some((p) => p.id === a.sessionId)).length / past.length : 0;
    const certs = certificates.list(userId).length;
    const reviewed = db.reviews.some((r) => r.userId === userId);
    const asked = db.questions.some((q) => q.userId === userId);
    return [
      { id: 'completer', title: 'Course Completer', desc: 'Earn your first certificate', icon: 'school', color: '#3B5BDB', earned: certs > 0, progress: Math.min(1, certs) },
      { id: 'quiz', title: 'Quiz Master', desc: 'Score 90%+ in a quiz', icon: 'locate', color: '#7C3AED', earned: best >= 90, progress: Math.min(1, best / 90) },
      { id: 'streak', title: 'Consistent Learner', desc: '7-day learning streak', icon: 'calendar', color: '#D97706', earned: true, progress: 1 },
      { id: 'top', title: 'Top Performer', desc: 'Rank in the top 10% of a quiz', icon: 'trophy', color: '#DC2626', earned: topRank <= 5, progress: topRank <= 5 ? 1 : 0.4 },
      { id: 'live', title: 'Live Regular', desc: 'Attend 80% of live classes', icon: 'radio', color: '#0F766E', earned: att >= 0.8, progress: Math.min(1, att / 0.8) },
      { id: 'voice', title: 'Helpful Voice', desc: 'Write a course review', icon: 'chatbubbles', color: '#DB2777', earned: reviewed, progress: reviewed ? 1 : 0 },
      { id: 'curious', title: 'Curious Mind', desc: 'Ask your first doubt', icon: 'help-buoy', color: '#0369A1', earned: asked, progress: asked ? 1 : 0 },
      { id: 'collector', title: 'Collector', desc: 'Earn 5 certificates', icon: 'ribbon', color: '#B45309', earned: certs >= 5, progress: Math.min(1, certs / 5) },
    ];
  },
};

export const support = {
  faqs: [
    { cat: 'Course & Learning', q: 'Can I watch lessons offline?', a: 'Yes. Tap Download under any lesson. Downloads play inside the app while your enrolment is active.' },
    { cat: 'Course & Learning', q: 'How long do I have access to a course?', a: 'Most courses give 12 months of access on app and web. Your access date is shown on the course page.' },
    { cat: 'Payments & Enrollment', q: 'Paid but the course is not showing?', a: 'It can take up to 5 minutes. Pull down to refresh My Learning. If it still is not there, raise a ticket with your payment ID.' },
    { cat: 'Payments & Enrollment', q: 'What is the refund policy?', a: 'Full refund within 7 days if you have watched less than 20% of the course. Request it from Help → Raise a ticket.' },
    { cat: 'Certificates', q: 'How do I get my certificate?', a: 'Complete all lessons and pass the required assessments. The certificate appears under Profile → Certificates.' },
    { cat: 'Certificates', q: 'How can an employer verify my certificate?', a: 'Share the certificate link or ID. Anyone can verify it at thebodhin.com/verify.' },
    { cat: 'Live Classes', q: 'Where are live class recordings?', a: 'Open Live → Past & Attendance. Recordings appear within an hour after the class.' },
    { cat: 'Account & Profile', q: 'How do I change my mobile number?', a: 'Go to Profile → Email & phone. We verify the new number with a one-time code.' },
    { cat: 'Technical Support', q: 'Videos keep buffering', a: 'Set video quality to Auto, or download the lesson on Wi-Fi and watch offline.' },
  ],
  tickets: (userId: string) => db.tickets.filter((t) => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  async raise(userId: string, input: { category: string; subject: string; body: string }) {
    await wait(600);
    if (input.subject.trim().length < 5) throw new ApiError('subject', 'Add a short subject (5+ characters).', 'subject');
    if (input.body.trim().length < 15) throw new ApiError('body', 'Describe the problem in a bit more detail (15+ characters).', 'body');
    const t = { id: `BOD-${4600 + db.tickets.length}`, userId, category: input.category, subject: input.subject.trim(), body: input.body.trim(), status: 'open' as const, createdAt: new Date().toISOString(), replies: [] };
    db.tickets.push(t);
    persist();
    return t;
  },
  contact: { email: 'support@thebodhin.com', phone: '+91 93451 39619', hours: 'Mon – Sat, 9 AM – 6 PM IST' },
};

export const notifications = {
  list: (userId: string) => db.notifications.filter((n) => n.userId === userId).sort((a, b) => b.at.localeCompare(a.at)),
  unread: (userId: string) => db.notifications.filter((n) => n.userId === userId && !n.read).length,
  markRead(userId: string, id?: string) {
    db.notifications.forEach((n) => {
      if (n.userId === userId && (!id || n.id === id)) n.read = true;
    });
    persist();
  },
};

/* ───────────────────────── Educator workspace (E0+) ───────────────────────── */

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export const educator = {
  /** Workspace + role for the signed-in educator. Real: resolved server-side from membership. */
  context(userId: string) {
    let m = db.memberships.find((x) => x.userId === userId && (x.role === 'owner' || x.role === 'tutor'));
    // Bodhin staff with content rights manage Bodhin's own academy with the same tools as an owner.
    if (!m) {
      const staff = db.memberships.find((x) => x.userId === userId && (x.role === 'super_admin' || x.role === 'moderator'));
      if (staff) m = { userId, tenantId: db.platformConfig.bodhinTenantId, role: 'owner' };
    }
    if (!m) return null;
    const tenant = db.tenants.find((t) => t.id === m.tenantId)!;
    const sub = tenant.subscription ?? { plan: tenant.plan, status: 'active' as const, billing: 'monthly' as const, periodEnd: new Date(Date.now() + 30 * 864e5).toISOString(), addons: [] };
    const ent = entitlements(sub);
    const usage = db.usage[tenant.id] ?? { activeStudents: 0, storageGb: 0, liveHours: 0, tutorSeats: 1 };
    return {
      role: m.role as 'owner' | 'tutor',
      tenant,
      sub,
      ent,
      usage: usageReport(usage, sub),
      trialDaysLeft: sub.status === 'trialing' ? daysLeft(sub.periodEnd) : null,
      host: tenant.customDomain ?? `${tenant.slug}.thebodhin.com`,
    };
  },

  /** Courses this user may manage: owner → all workspace courses; tutor → assigned only. */
  courses(userId: string) {
    const ctx = educator.context(userId);
    if (!ctx) return [];
    const all = seedCourses.filter((c) => c.tenantId === ctx.tenant.id);
    if (ctx.role === 'owner') return all;
    const mine = new Set(db.tutorAssignments.filter((a) => a.userId === userId).map((a) => a.courseId));
    return all.filter((c) => mine.has(c.id));
  },

  /** Sales of this workspace this month, split by who collected the money. */
  earnings(tenantId: string) {
    const from = monthStart();
    const rows = db.orders.filter((o) => o.sellerTenantId === tenantId && o.status === 'paid');
    const month = rows.filter((o) => new Date(o.createdAt).getTime() >= from);
    const direct = month.filter((o) => o.channel === 'tutor_direct');
    const market = month.filter((o) => o.channel === 'bodhin_marketplace');
    const sum = (l: typeof rows, f: (o: (typeof rows)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
    const upcoming = rows.filter((o) => o.channel === 'bodhin_marketplace' && o.payoutDate && (o.payoutStatus === 'on_hold' || o.payoutStatus === 'scheduled')).sort((a, b) => a.payoutDate!.localeCompare(b.payoutDate!));
    const nextDate = upcoming[0]?.payoutDate ?? null;
    const net = sum(direct, (o) => o.amountInr) + sum(market, (o) => o.educatorShareInr);
    const history = [...(db.tenantStats[tenantId]?.earningsHistory ?? []), net];
    const prev = history[history.length - 2] ?? 0;
    return {
      net,
      deltaPct: prev ? Math.round(((net - prev) / prev) * 100) : 0,
      direct: { gross: sum(direct, (o) => o.amountInr), count: direct.length },
      marketplace: { gross: sum(market, (o) => o.amountInr), commission: sum(market, (o) => o.commissionInr), fees: sum(market, (o) => o.gatewayFeeInr ?? 0), net: sum(market, (o) => o.educatorShareInr), count: market.length },
      nextPayout: nextDate ? { date: nextDate, amount: sum(upcoming.filter((o) => o.payoutDate === nextDate), (o) => o.educatorShareInr) } : null,
      history,
    };
  },

  async dashboard(userId: string) {
    await wait(300);
    const ctx = educator.context(userId);
    if (!ctx) throw new ApiError('no_workspace', 'You don’t manage a workspace yet.');
    const courses = educator.courses(userId);
    const ids = new Set(courses.map((c) => c.id));
    const now = Date.now();
    const sessions = unified().filter((s) => canHost(userId, s) && s.state !== 'cancelled');
    const next = sessions.filter((s) => new Date(s.endsAt).getTime() > now && s.state !== 'conducted').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const monthSessions = sessions.filter((s) => s.state === 'conducted' && new Date(s.startsAt).getTime() >= monthStart()).length;
    const toGrade = db.submissions.filter((s) => s.status === 'submitted' && ASSESSMENTS.some((a) => a.id === s.assessmentId && ids.has(a.courseId))).length;
    const doubtCount = db.questions.filter((q) => ids.has(q.courseId) && !q.answer).length;
    const inReview = courses.filter((c) => c.moderation === 'pending').length;
    const stats = db.tenantStats[ctx.tenant.id] ?? { students: 0, studentsDelta: 0, completion: { completed: 0, inProgress: 0, notStarted: 0 }, earningsHistory: [] };
    const attention = [
      { key: 'grade', icon: 'document-text', label: 'Assignments to grade', count: toGrade, href: '/edu/grading' },
      { key: 'doubts', icon: 'chatbubbles', label: 'Student doubts waiting', count: doubtCount, href: '/edu/doubts' },
      { key: 'review', icon: 'hourglass', label: 'Courses in Bodhin review', count: inReview, href: '/educator/courses' },
      lowAttendance(userId),
    ].filter((a) => a.count > 0);
    return {
      ctx,
      firstName: db.users.find((u) => u.id === userId)?.name.split(' ')[0] ?? '',
      kpis: {
        students: ctx.role === 'owner' ? stats.students : courses.reduce((s, c) => s + Math.round(c.students / 10), 0),
        studentsDelta: stats.studentsDelta,
        liveCourses: courses.filter((c) => c.moderation === 'approved').length,
        sessionsThisMonth: monthSessions,
      },
      next: next ? { session: next, course: seedCourses.find((c) => c.id === next.courseId)! } : null,
      attention,
      earnings: ctx.role === 'owner' ? educator.earnings(ctx.tenant.id) : null,
      completion: stats.completion,
      activity: db.activity.filter((a) => a.tenantId === ctx.tenant.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5),
    };
  },
};

/* ───────────────────────── Course builder (E2) ───────────────────────── */

export const COVER_PRESETS = [
  { from: '#0B3B73', to: '#3B5BDB' }, { from: '#4C1D95', to: '#7C3AED' }, { from: '#9A3412', to: '#F59E0B' }, { from: '#065F46', to: '#10B981' },
  { from: '#BE185D', to: '#F97316' }, { from: '#0F172A', to: '#1E40AF' }, { from: '#0E7490', to: '#22D3EE' }, { from: '#7F1D1D', to: '#EF4444' },
];
export const COVER_ICONS = ['trending-up', 'megaphone', 'code-slash', 'color-palette', 'stats-chart', 'hardware-chip', 'school', 'briefcase', 'camera', 'calculator', 'language', 'musical-notes'];

/** Each workspace has its own instructor profile (shown on course pages); created on first need. */
function ensureTutorProfile(tenantId: string, userId: string) {
  const existing = seedTutors.find((t) => t.tenantId === tenantId);
  if (existing) return existing;
  const u = db.users.find((x) => x.id === userId);
  const app = db.applications.find((a) => a.userId === userId && a.status === 'approved');
  const palette = ['#0F6E5A', '#6D28D9', '#B45309', '#0E7490', '#BE185D', '#1D4ED8'];
  const t = { id: `tu_${tenantId.replace(/^t_/, '')}`, tenantId, name: u?.name ?? 'Instructor', headline: app?.subjects?.length ? `${app.subjects.join(', ')} educator` : 'Educator on Bodhin', yearsExperience: app?.experienceYears ?? 1, verified: !!app?.idVerified, color: palette[(tenantId.length + (u?.name.length ?? 0)) % palette.length] };
  db.tutorProfiles.push(t);
  seedTutors.push(t);
  persist();
  return t;
}

function saveCourse(c: Course) {
  c.updatedAt = new Date().toISOString();
  const i = db.courses.findIndex((x) => x.id === c.id);
  i >= 0 ? (db.courses[i] = c) : db.courses.push(c);
  const j = seedCourses.findIndex((x) => x.id === c.id);
  j >= 0 ? (seedCourses[j] = c) : seedCourses.push(c);
  persist();
  return c;
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function canManage(userId: string, courseId: string) {
  const ctx = educator.context(userId);
  const c = seedCourses.find((x) => x.id === courseId);
  if (!ctx || !c || c.tenantId !== ctx.tenant.id) return null;
  if (ctx.role === 'tutor' && !db.tutorAssignments.some((a) => a.userId === userId && a.courseId === courseId)) return null;
  return { ctx, course: clone(c) };
}

export type CourseState = 'draft' | 'private' | 'in_review' | 'listed' | 'promoted' | 'changes' | 'archived';
export function courseState(c: Course): CourseState {
  if (c.status === 'archived') return 'archived';
  if (!isPublished(c)) return 'draft';
  if (c.visibility === 'private') return 'private';
  if (c.moderation === 'pending') return 'in_review';
  if (c.moderation === 'rejected') return 'changes';
  return c.visibility === 'public_promoted' ? 'promoted' : 'listed';
}

export const courseAdmin = {
  async list(userId: string) {
    await wait(220);
    return educator.courses(userId)
      .filter((c) => c.status !== 'archived')
      .map((c) => {
        const enr = db.enrollments.filter((e) => e.courseId === c.id);
        const orders = db.orders.filter((o) => o.courseId === c.id && o.status === 'paid' && o.sellerTenantId === c.tenantId);
        const students = c.students + enr.length;
        const completion = enr.length ? Math.round(enr.reduce((s, e) => s + progressOf(c, e).pct, 0) / enr.length) : students ? 64 : 0;
        return { course: c, state: courseState(c), students, completion, revenue: orders.reduce((s, o) => s + (o.channel === 'tutor_direct' ? o.amountInr : o.educatorShareInr), 0), lessons: allLessons(c).length };
      })
      .sort((a, b) => (b.course.updatedAt ?? b.course.publishedAt).localeCompare(a.course.updatedAt ?? a.course.publishedAt));
  },

  get(userId: string, id: string) {
    const r = canManage(userId, id);
    if (!r) return null;
    return { course: r.course, role: r.ctx.role, state: courseState(r.course), ctx: r.ctx };
  },

  /** Creates an empty draft and returns its id (owners only). */
  create(userId: string) {
    const ctx = educator.context(userId);
    if (!ctx || ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can create courses.');
    const tutor = ensureTutorProfile(ctx.tenant.id, userId);
    const id = uid('c');
    const cover = COVER_PRESETS[Math.floor(Math.random() * COVER_PRESETS.length)];
    saveCourse({
      id, tenantId: ctx.tenant.id, tutorId: tutor.id, title: '', subtitle: '', description: '', categoryId: '', collections: [], level: 'beginner', format: 'recorded',
      priceInr: 0, rating: 0, ratingCount: 0, students: 0, visibility: 'private', moderation: 'approved', outcomes: [], projects: 0, certificate: true,
      art: { ...cover, icon: 'school' }, modules: [{ id: uid('m'), title: 'Module 1', lessons: [] }], publishedAt: '', status: 'draft', language: 'English', accessMonths: 12, drip: { enabled: false, everyDays: 7 },
    });
    return id;
  },

  /** Partial update. Tutors can edit content only; pricing/listing are owner-only. */
  update(userId: string, id: string, patch: Partial<Course>) {
    const r = canManage(userId, id);
    if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
    const ownerOnly: (keyof Course)[] = ['priceInr', 'compareAtInr', 'offerEndsAt', 'visibility', 'accessMonths', 'drip', 'format', 'status'];
    if (r.ctx.role === 'tutor' && ownerOnly.some((k) => k in patch)) throw new ApiError('forbidden', 'Only the workspace owner can change pricing and publishing.');
    // Fields an educator must never set directly: Bodhin moderation, social proof, ownership,
    // and going live (publish() runs the checklist). Server: same rule in the courses trigger.
    const { moderation: _m, moderationNote: _mn, rating: _r, ratingCount: _rc, students: _s, tenantId: _t, id: _id, ...safe } = patch;
    if (safe.status === 'published' && r.course.status !== 'published') delete safe.status;
    if ('visibility' in safe && safe.visibility !== r.course.visibility) {
      // listing changes go through setListing() so a public listing is sent for review
      const v = safe.visibility!;
      delete safe.visibility;
      saveCourse({ ...r.course, ...safe });
      return courseAdmin.setListing(userId, id, v);
    }
    // A material change to an approved public listing (title / price) goes back to review.
    const relist = r.course.visibility !== 'private' && r.course.moderation === 'approved' && isPublished(r.course) && r.course.tenantId !== db.platformConfig.bodhinTenantId
      && ((safe.title !== undefined && safe.title !== r.course.title) || (safe.priceInr !== undefined && safe.priceInr !== r.course.priceInr));
    return saveCourse({ ...r.course, ...safe, ...(relist ? { moderation: 'pending' as const } : {}) });
  },

  addModule(userId: string, id: string, title: string) {
    const r = canManage(userId, id);
    if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
    if (title.trim().length < 3) throw new ApiError('title', 'Give the module a name (3+ characters).', 'title');
    r.course.modules.push({ id: uid('m'), title: title.trim(), lessons: [] });
    return saveCourse(r.course);
  },
  renameModule(userId: string, id: string, moduleId: string, title: string) {
    const r = canManage(userId, id)!;
    if (title.trim().length < 3) throw new ApiError('title', 'Give the module a name (3+ characters).', 'title');
    r.course.modules = r.course.modules.map((m) => (m.id === moduleId ? { ...m, title: title.trim() } : m));
    return saveCourse(r.course);
  },
  deleteModule(userId: string, id: string, moduleId: string) {
    const r = canManage(userId, id)!;
    if (isPublished(r.course) && db.enrollments.some((e) => e.courseId === id)) {
      const m = r.course.modules.find((x) => x.id === moduleId);
      if (m?.lessons.length) throw new ApiError('in_use', 'Students are enrolled. Move or delete the lessons first so nobody loses progress unexpectedly.');
    }
    r.course.modules = r.course.modules.filter((m) => m.id !== moduleId);
    return saveCourse(r.course);
  },
  moveModule(userId: string, id: string, moduleId: string, dir: -1 | 1) {
    const r = canManage(userId, id)!;
    const i = r.course.modules.findIndex((m) => m.id === moduleId);
    const j = i + dir;
    if (j < 0 || j >= r.course.modules.length) return r.course;
    [r.course.modules[i], r.course.modules[j]] = [r.course.modules[j], r.course.modules[i]];
    return saveCourse(r.course);
  },

  lesson(userId: string, id: string, lessonId?: string) {
    const r = canManage(userId, id);
    if (!r) return null;
    const flat = r.course.modules.flatMap((m) => m.lessons.map((l) => ({ m, l })));
    const found = flat.find((x) => x.l.id === lessonId);
    return { course: r.course, module: found?.m ?? null, lesson: found?.l ?? null, index: found ? flat.indexOf(found) : -1, total: flat.length, flat };
  },

  saveLesson(userId: string, id: string, moduleId: string, lesson: Omit<Lesson, 'id'> & { id?: string }) {
    const r = canManage(userId, id);
    if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
    if (lesson.title.trim().length < 3) throw new ApiError('title', 'Add a lesson title (3+ characters).', 'title');
    if (lesson.type === 'video' && !lesson.durationSec) throw new ApiError('file', 'Upload the lesson video before saving.', 'file');
    if (lesson.type === 'pdf' && !lesson.sizeMb) throw new ApiError('file', 'Upload the PDF before saving.', 'file');
    const full: Lesson = { ...lesson, title: lesson.title.trim(), id: lesson.id ?? uid('l') };
    // remove from any module, then place into the target module (keeps position when unchanged)
    let placed = false;
    r.course.modules = r.course.modules.map((m) => {
      const at = m.lessons.findIndex((l) => l.id === full.id);
      if (at >= 0 && m.id === moduleId) {
        placed = true;
        return { ...m, lessons: m.lessons.map((l) => (l.id === full.id ? full : l)) };
      }
      return at >= 0 ? { ...m, lessons: m.lessons.filter((l) => l.id !== full.id) } : m;
    });
    if (!placed) r.course.modules = r.course.modules.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, full] } : m));
    saveCourse(r.course);
    return full;
  },
  deleteLesson(userId: string, id: string, lessonId: string) {
    const r = canManage(userId, id)!;
    const l = allLessons(r.course).find((x) => x.id === lessonId);
    r.course.modules = r.course.modules.map((m) => ({ ...m, lessons: m.lessons.filter((x) => x.id !== lessonId) }));
    if (l?.sizeMb) adjustStorage(r.ctx.tenant.id, -l.sizeMb / 1024);
    return saveCourse(r.course);
  },
  moveLesson(userId: string, id: string, moduleId: string, lessonId: string, dir: -1 | 1) {
    const r = canManage(userId, id)!;
    r.course.modules = r.course.modules.map((m) => {
      if (m.id !== moduleId) return m;
      const ls = [...m.lessons];
      const i = ls.findIndex((l) => l.id === lessonId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return m;
      [ls[i], ls[j]] = [ls[j], ls[i]];
      return { ...m, lessons: ls };
    });
    return saveCourse(r.course);
  },

  /** Storage check before an upload starts (100% policy: block new uploads, never delete). */
  canUpload(userId: string, sizeMb: number) {
    const ctx = educator.context(userId)!;
    const row = ctx.usage.rows.find((x) => x.key === 'storageGb')!;
    if (row.limit != null && row.used + sizeMb / 1024 > row.limit) return { ok: false as const, message: `Not enough storage: ${row.used} of ${row.limit} GB used. Add a storage top-up or upgrade your plan. Nothing will be deleted.` };
    return { ok: true as const, leftGb: row.limit == null ? null : Math.round((row.limit - row.used) * 10) / 10 };
  },

  /**
   * POC upload: simulated progress + extracted duration. Real: request a presigned URL, upload to
   * private object storage, then a transcoding job reports duration and renditions.
   */
  upload(userId: string, kind: 'video' | 'pdf', fileName: string, sizeMb: number, onProgress: (p: number) => void) {
    const check = courseAdmin.canUpload(userId, sizeMb);
    if (!check.ok) return Promise.reject(new ApiError('storage_full', check.message));
    return new Promise<{ fileName: string; sizeMb: number; durationSec?: number }>((resolve) => {
      let p = 0;
      const t = setInterval(() => {
        p = Math.min(100, p + 9 + Math.random() * 12);
        onProgress(Math.round(p));
        if (p >= 100) {
          clearInterval(t);
          adjustStorage(educator.context(userId)!.tenant.id, sizeMb / 1024);
          resolve({ fileName, sizeMb, durationSec: kind === 'video' ? Math.round(sizeMb * 2.2 + 120) : undefined });
        }
      }, 220);
    });
  },

  /**
   * `pay` = the workspace's payment setup. Selling on the tutor's own site needs their own gateway;
   * a marketplace listing (Bodhin collects) needs only a verified payout bank account.
   */
  checklist(c: Course, pay: Tenant['payments'] | boolean | undefined) {
    const lessons = allLessons(c);
    const p = typeof pay === 'boolean' ? { gateway: pay, bank: pay } : { gateway: pay?.directGatewayStatus === 'active', bank: !!pay?.payoutAccount?.verified };
    const listed = c.visibility !== 'private';
    const payOk = c.priceInr === 0 || p.gateway || (listed && p.bank);
    return [
      { key: 'details', step: 0, label: 'Course details', sub: 'Title, subtitle, category, level and description', ok: c.title.trim().length >= 5 && c.subtitle.trim().length >= 10 && !!c.categoryId && c.description.trim().length >= 50 },
      { key: 'outcomes', step: 0, label: 'At least 3 learning outcomes', sub: 'Shown on the course page', ok: c.outcomes.filter((o) => o.trim()).length >= 3 },
      { key: 'content', step: 1, label: 'Content added', sub: `${c.modules.length} modules · ${lessons.length} lessons`, ok: lessons.length >= 1 && c.modules.every((m) => m.lessons.length > 0) },
      { key: 'preview', step: 1, label: 'Free preview lesson', sub: 'Recommended for marketplace listings', ok: lessons.some((l) => l.preview), optional: true },
      // Same bar Bodhin's reviewers apply (approvals.courseChecks) — tell the educator before they submit.
      { key: 'listing', step: 1, label: 'At least 3 lessons for a marketplace listing', sub: listed ? `${lessons.length} of 3 lessons` : 'Only needed if you list on thebodhin.com', ok: !listed || lessons.length >= 3 },
      { key: 'pricing', step: 2, label: 'Pricing & access set', sub: c.priceInr ? `₹${c.priceInr.toLocaleString('en-IN')} · ${c.accessMonths ? `${c.accessMonths} months` : 'lifetime'} access` : 'Free course', ok: c.priceInr === 0 || c.priceInr >= 99 },
      { key: 'offer', step: 2, label: 'Offer has an end date', sub: 'A crossed-out price needs a real deadline', ok: !c.compareAtInr || (!!c.offerEndsAt && new Date(c.offerEndsAt).getTime() > Date.now()) },
      { key: 'payments', step: 2, label: 'Payments set up', sub: listed ? 'Connect your gateway (own-site sales) or verify a payout bank account (marketplace sales)' : 'Connect your payment gateway to sell on your own site', ok: payOk },
    ];
  },

  /** Publish: live on the workspace immediately; a public listing goes to Bodhin review. */
  async publish(userId: string, id: string) {
    await wait(700);
    const r = canManage(userId, id);
    if (!r || r.ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can publish.');
    const missing = courseAdmin.checklist(r.course, r.ctx.tenant.payments).filter((x) => !x.ok && !x.optional);
    if (missing.length) throw new ApiError('incomplete', `Finish these first: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`);
    const bodhinOwn = r.course.tenantId === db.platformConfig.bodhinTenantId;
    const listing = r.course.visibility !== 'private';
    const c = saveCourse({ ...r.course, status: 'published', publishedAt: r.course.publishedAt || new Date().toISOString(), moderation: listing && !bodhinOwn ? 'pending' : 'approved', moderationNote: undefined });
    db.activity.push({ id: uid('act'), tenantId: c.tenantId, kind: 'review', text: listing ? `“${c.title}” published and sent for Bodhin listing review` : `“${c.title}” published on your site`, at: new Date().toISOString() });
    persist();
    return { course: c, state: courseState(c) };
  },

  /** Change listing after publish. Moving to public (again) needs review; going private or dropping promotion is instant. */
  setListing(userId: string, id: string, visibility: Course['visibility']) {
    const r = canManage(userId, id);
    if (!r || r.ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can change listing.');
    const wasApprovedPublic = r.course.visibility !== 'private' && r.course.moderation === 'approved';
    let moderation = r.course.moderation;
    if (visibility === 'private') moderation = 'approved';
    else if (!wasApprovedPublic && isPublished(r.course)) moderation = 'pending';
    return saveCourse({ ...r.course, visibility, moderation });
  },

  archive(userId: string, id: string) {
    const r = canManage(userId, id);
    if (!r || r.ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can archive.');
    if (db.enrollments.some((e) => e.courseId === id)) return saveCourse({ ...r.course, visibility: 'private', moderation: 'approved', status: 'archived' }); // enrolled students keep access
    db.courses = db.courses.filter((x) => x.id !== id);
    const j = seedCourses.findIndex((x) => x.id === id);
    if (j >= 0) seedCourses.splice(j, 1);
    persist();
    return null;
  },

  duplicate(userId: string, id: string) {
    const r = canManage(userId, id);
    if (!r || r.ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can duplicate.');
    const copy = clone(r.course);
    copy.id = uid('c');
    copy.title = `${copy.title} (copy)`;
    copy.status = 'draft';
    copy.visibility = 'private';
    copy.moderation = 'approved';
    copy.students = 0;
    copy.rating = 0;
    copy.ratingCount = 0;
    copy.badge = undefined;
    copy.modules = copy.modules.map((m: Module) => ({ ...m, id: uid('m'), lessons: m.lessons.map((l) => ({ ...l, id: uid('l') })) }));
    return saveCourse(copy).id;
  },

  /** POC ONLY: stands in for the Super Admin moderation queue until it is built. */
  demoReview(id: string, decision: 'approve' | 'changes') {
    const c = clone(seedCourses.find((x) => x.id === id)!);
    return saveCourse({ ...c, moderation: decision === 'approve' ? 'approved' : 'rejected', moderationNote: decision === 'changes' ? 'Please add a free preview lesson and a clearer course description (what learners can do after the course).' : undefined });
  },
};

/** Dashboard row: low-attendance students across this educator's active batches. */
function lowAttendance(userId: string) {
  const bs = visibleBatches(userId).filter((b) => batchStatus(b) === 'active');
  let n = 0;
  let first = bs[0]?.id;
  for (const b of bs) {
    const low = batchesApi.report(b.id).low.length;
    if (low && !n) first = b.id;
    n += low;
  }
  return { key: 'attendance', icon: 'alert-circle', label: 'Students below 75% attendance', count: n, href: `/edu/batch/${first}?tab=attendance` };
}

function adjustStorage(tenantId: string, gb: number) {
  const u = db.usage[tenantId];
  if (!u) return;
  u.storageGb = Math.max(0, Math.round((u.storageGb + gb) * 100) / 100);
  persist();
}

/** Live platform config (Super Admin editable). */
export const platform = {
  config: () => db.platformConfig,
};

/* ───────────────────────── Batches, students, attendance, announcements (E3) ───────────────────────── */

const personProgress = (p: Person, courseId: string) => {
  const pc = p.courses.find((x) => x.courseId === courseId);
  if (p.userId) {
    const c = seedCourses.find((x) => x.id === courseId);
    const e = db.enrollments.find((x) => x.userId === p.userId && x.courseId === courseId);
    if (c && e) return progressOf(c, e).pct;
  }
  return pc?.progress ?? 0;
};

function ctxOrThrow(userId: string) {
  const ctx = educator.context(userId);
  if (!ctx) throw new ApiError('forbidden', 'No workspace.');
  return ctx;
}
function visibleBatches(userId: string) {
  const ctx = ctxOrThrow(userId);
  return db.batches.filter((b) => b.tenantId === ctx.tenant.id && (ctx.role === 'owner' || b.instructorIds.includes(userId)));
}
const membersOf = (batchId: string) => db.people.filter((p) => p.courses.some((c) => c.batchId === batchId));
const memberEntry = (p: Person, batchId: string) => p.courses.find((c) => c.batchId === batchId)!;
const sessionsOf = (batchId: string) => db.classSessions.filter((s) => s.batchId === batchId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
const marksFor = (personId: string, batchId: string) => {
  const ids = new Set(sessionsOf(batchId).filter((s) => s.status === 'conducted').map((s) => s.id));
  return db.batchAttendance.filter((m) => m.personId === personId && ids.has(m.sessionId));
};

/** Notify a linked Bodhin account (shows in the student's Notifications). */
function notifyPerson(p: Person, title: string, body: string, kind: 'live' | 'course' | 'system' = 'course') {
  if (!p.userId) return;
  db.notifications.push({ id: uid('n'), userId: p.userId, kind, title, body, at: new Date().toISOString(), read: false });
}

/** Adds an active student against the plan limit (100% policy: block new, never remove). */
function consumeStudentSeat(tenantId: string) {
  const ctx = db.tenants.find((t) => t.id === tenantId)!;
  const sub = ctx.subscription ?? { plan: ctx.plan, status: 'active' as const, billing: 'monthly' as const, periodEnd: '', addons: [] };
  const lim = entitlements(sub).limits.activeStudents;
  const u = db.usage[tenantId];
  if (u && lim != null && u.activeStudents >= lim) throw new ApiError('limit', `Active-student limit reached (${u.activeStudents.toLocaleString('en-IN')} / ${lim.toLocaleString('en-IN')}). Upgrade or add a student block to enroll new students. Existing students are not affected.`);
  if (u) u.activeStudents += 1;
}

export const batchesApi = {
  async list(userId: string) {
    await wait(220);
    return visibleBatches(userId)
      .map((b) => {
        const course = seedCourses.find((c) => c.id === b.courseId)!;
        const members = membersOf(b.id).filter((p) => memberEntry(p, b.id).status !== 'pending');
        const progress = members.length ? Math.round(members.reduce((s, p) => s + personProgress(p, b.courseId), 0) / members.length) : 0;
        const next = sessionsOf(b.id).find((s) => s.status === 'scheduled' && new Date(s.endsAt).getTime() > Date.now());
        return { batch: b, course, status: batchStatus(b), students: members.length, pending: membersOf(b.id).length - members.length, progress, weeks: weeksBetween(b.startDate, b.endDate), next };
      })
      .sort((a, b) => ['active', 'upcoming', 'completed'].indexOf(a.status) - ['active', 'upcoming', 'completed'].indexOf(b.status));
  },

  get(userId: string, id: string) {
    const b = visibleBatches(userId).find((x) => x.id === id);
    if (!b) return null;
    const ctx = ctxOrThrow(userId);
    const course = seedCourses.find((c) => c.id === b.courseId)!;
    const sessions = sessionsOf(id);
    const members = membersOf(id);
    const active = members.filter((p) => memberEntry(p, id).status !== 'pending');
    const conducted = sessions.filter((s) => s.status === 'conducted');
    const allMarks = db.batchAttendance.filter((m) => conducted.some((s) => s.id === m.sessionId));
    return {
      batch: b,
      course,
      ctx,
      status: batchStatus(b),
      weeks: weeksBetween(b.startDate, b.endDate),
      instructors: b.instructorIds.map((u) => db.users.find((x) => x.id === u)!).filter(Boolean),
      counts: {
        enrolled: active.length,
        pending: members.length - active.length,
        activeLearners: active.filter((p) => Date.now() - new Date(p.lastActiveAt).getTime() < 7 * 864e5).length,
        completed: active.filter((p) => memberEntry(p, id).status === 'completed' || personProgress(p, b.courseId) === 100).length,
        avgProgress: active.length ? Math.round(active.reduce((s, p) => s + personProgress(p, b.courseId), 0) / active.length) : 0,
        sessions: sessions.length,
        conducted: conducted.length,
        upcoming: sessions.filter((s) => s.status === 'scheduled').length,
        attendance: attendancePct(allMarks),
      },
      next: sessions.find((s) => s.status === 'scheduled' && new Date(s.endsAt).getTime() > Date.now()) ?? null,
      lastAnnouncement: db.announcements.filter((a) => a.batchId === id && a.status === 'sent').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
      joinLink: `https://${ctx.host}/join/${b.code}`,
    };
  },

  roster(id: string) {
    const b = db.batches.find((x) => x.id === id)!;
    return membersOf(id)
      .map((p) => {
        const e = memberEntry(p, id);
        const marks = marksFor(p.id, id);
        return { person: p, status: e.status, progress: personProgress(p, b.courseId), attended: marks.filter((m) => m.status !== 'absent').length, conducted: marks.length, attendance: attendancePct(marks) };
      })
      .sort((a, b) => a.person.name.localeCompare(b.person.name));
  },

  /** Workspace students not yet in this batch. */
  candidates(userId: string, id: string) {
    const ctx = ctxOrThrow(userId);
    return db.people.filter((p) => p.tenantId === ctx.tenant.id && !p.courses.some((c) => c.batchId === id));
  },

  async create(userId: string, input: Omit<Batch, 'id' | 'tenantId' | 'createdAt' | 'status'>, addPersonIds: string[]) {
    await wait(500);
    const ctx = ctxOrThrow(userId);
    if (ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can create batches.');
    if (!ctx.ent.has('batches')) throw new ApiError('plan', `Batches are available from the Creator plan. You are on ${ctx.ent.plan.name}.`);
    if (input.name.trim().length < 4) throw new ApiError('name', 'Give the batch a name (4+ characters).', 'name');
    if (!input.courseId) throw new ApiError('course', 'Choose a course.', 'course');
    if (new Date(input.endDate) <= new Date(input.startDate)) throw new ApiError('dates', 'End date must be after the start date.', 'dates');
    if (!input.slots.length) throw new ApiError('slots', 'Add at least one weekly class slot.', 'slots');
    if (input.slots.some((s) => s.end <= s.start)) throw new ApiError('slots', 'Each slot must end after it starts.', 'slots');
    if (db.batches.some((b) => b.tenantId === ctx.tenant.id && b.code.toUpperCase() === input.code.trim().toUpperCase())) throw new ApiError('code', 'This batch code is already used. Codes appear in the enrollment link.', 'code');
    if (addPersonIds.length > input.capacity) throw new ApiError('capacity', `You selected ${addPersonIds.length} students but capacity is ${input.capacity}.`);
    const b: Batch = { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), id: uid('b'), tenantId: ctx.tenant.id, createdAt: new Date().toISOString(), status: 'published' };
    db.batches.push(b);
    const course = seedCourses.find((c) => c.id === b.courseId)!;
    const topics = course.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'video').map((l) => l.title));
    db.classSessions.push(...generateSessions(b, topics, `s_${b.id}`));
    for (const pid of addPersonIds) {
      const p = db.people.find((x) => x.id === pid)!;
      p.courses.push({ courseId: b.courseId, batchId: b.id, progress: 0, enrolledAt: new Date().toISOString(), status: 'active' });
      notifyPerson(p, `You’re in “${b.name}”`, `Classes start ${new Date(b.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`);
    }
    db.activity.push({ id: uid('act'), tenantId: b.tenantId, kind: 'enroll', text: `Batch “${b.name}” created with ${addPersonIds.length} students`, at: new Date().toISOString(), link: { pathname: '/edu/batch/[id]', params: { id: b.id } } });
    persist();
    return b.id;
  },

  addMembers(userId: string, id: string, personIds: string[]) {
    const r = batchesApi.get(userId, id);
    if (!r) throw new ApiError('forbidden', 'No access to this batch.');
    if (r.counts.enrolled + personIds.length > r.batch.capacity) throw new ApiError('capacity', `Only ${r.batch.capacity - r.counts.enrolled} seats left in this batch.`);
    for (const pid of personIds) {
      const p = db.people.find((x) => x.id === pid)!;
      p.courses.push({ courseId: r.batch.courseId, batchId: id, progress: personProgress(p, r.batch.courseId), enrolledAt: new Date().toISOString(), status: 'active' });
      notifyPerson(p, `You’re in “${r.batch.name}”`, 'Your class schedule is in the Live tab.');
    }
    persist();
  },

  setMemberStatus(id: string, personId: string, status: MemberStatus | 'removed') {
    const p = db.people.find((x) => x.id === personId)!;
    if (status === 'removed') p.courses = p.courses.filter((c) => c.batchId !== id);
    else {
      memberEntry(p, id).status = status;
      if (status === 'active') notifyPerson(p, 'Batch request approved', `You can now join classes in “${db.batches.find((b) => b.id === id)?.name}”.`);
    }
    persist();
  },

  sessions: sessionsOf,

  attendance(sessionId: string) {
    const s = db.classSessions.find((x) => x.id === sessionId)!;
    const members = membersOf(s.batchId).filter((p) => memberEntry(p, s.batchId).status !== 'pending');
    return members
      .map((p) => ({ person: p, mark: db.batchAttendance.find((m) => m.sessionId === sessionId && m.personId === p.id) ?? null }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name));
  },

  /** Saves marks for a session and marks the session conducted. */
  saveAttendance(sessionId: string, marks: { personId: string; status: Mark; note?: string }[]) {
    db.batchAttendance = db.batchAttendance.filter((m) => m.sessionId !== sessionId);
    db.batchAttendance.push(...marks.map((m) => ({ ...m, sessionId })));
    const s = db.classSessions.find((x) => x.id === sessionId)!;
    if (s.status === 'scheduled' && new Date(s.startsAt).getTime() <= Date.now()) s.status = 'conducted';
    persist();
  },

  /** Live-room join logs → marks (POC: Arjun from real join data, others simulated). Real: provider webhooks. */
  importFromLive(sessionId: string): { personId: string; status: Mark; note?: string }[] {
    const rows = batchesApi.attendance(sessionId);
    return rows.map(({ person }, i) => {
      const realJoin = person.userId ? db.attendance.find((a) => a.userId === person.userId) : null;
      if (person.userId) return { personId: person.id, status: realJoin ? 'present' : 'absent', note: realJoin ? `Joined ${Math.max(1, realJoin.minutes)} min` : 'Did not join' };
      const k = (i * 7 + sessionId.length) % 20;
      return { personId: person.id, status: k === 0 ? 'absent' : k === 1 ? 'late' : 'present', note: k === 1 ? 'Joined 14 min late' : undefined };
    });
  },

  setSessionStatus(sessionId: string, status: 'cancelled' | 'scheduled') {
    const s = db.classSessions.find((x) => x.id === sessionId)!;
    s.status = status;
    if (status === 'cancelled') membersOf(s.batchId).forEach((p) => notifyPerson(p, 'Class cancelled', `${s.title} on ${new Date(s.startsAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} is cancelled.`, 'live'));
    persist();
  },

  report(id: string) {
    const sessions = sessionsOf(id).filter((s) => s.status === 'conducted');
    const marks = db.batchAttendance.filter((m) => sessions.some((s) => s.id === m.sessionId));
    const weeks: { label: string; pct: number }[] = [];
    const byWeek = new Map<number, AttendanceMark[]>();
    const start = new Date(db.batches.find((b) => b.id === id)!.startDate).getTime();
    sessions.forEach((s) => {
      const w = Math.floor((new Date(s.startsAt).getTime() - start) / (7 * 864e5));
      byWeek.set(w, [...(byWeek.get(w) ?? []), ...marks.filter((m) => m.sessionId === s.id)]);
    });
    [...byWeek.entries()].sort((a, b) => a[0] - b[0]).forEach(([w, ms]) => weeks.push({ label: `W${w + 1}`, pct: attendancePct(ms) ?? 0 }));
    const n = marks.length || 1;
    const students = batchesApi.roster(id).filter((r) => r.status !== 'pending').sort((a, b) => (a.attendance ?? 101) - (b.attendance ?? 101));
    const prev = weeks.length > 1 ? weeks[weeks.length - 2].pct : null;
    return {
      avg: attendancePct(marks) ?? 0,
      conducted: sessions.length,
      low: students.filter((s) => s.attendance != null && s.attendance < 75),
      delta: prev != null ? weeks[weeks.length - 1].pct - prev : 0,
      dist: { present: Math.round((marks.filter((m) => m.status === 'present').length / n) * 100), late: Math.round((marks.filter((m) => m.status === 'late').length / n) * 100), absent: Math.round((marks.filter((m) => m.status === 'absent').length / n) * 100) },
      weeks,
      students,
    };
  },

  /** CSV text for export (opens the share sheet on phones). */
  attendanceCsv(id: string) {
    const rows = batchesApi.report(id).students;
    return ['Student,Enrollment ID,Email,Attended,Classes,Attendance %'].concat(rows.map((r) => `${r.person.name},${r.person.enrollmentId},${r.person.email},${r.attended},${r.conducted},${r.attendance ?? ''}`)).join('\n');
  },

  announcements(id: string) {
    return db.announcements.filter((a) => a.batchId === id).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  },

  async announce(userId: string, input: { batchId: string; title: string; body: string; kind: Announcement['kind']; pinned: boolean; audience: Announcement['audience']; mode: 'send' | 'schedule' | 'draft'; sendAt?: string; id?: string }) {
    await wait(400);
    if (input.title.trim().length < 4) throw new ApiError('title', 'Add a short title (4+ characters).', 'title');
    if (input.mode !== 'draft' && input.body.trim().length < 10) throw new ApiError('body', 'Write the message (10+ characters).', 'body');
    if (input.mode === 'schedule' && (!input.sendAt || new Date(input.sendAt).getTime() < Date.now() + 5 * 6e4)) throw new ApiError('sendAt', 'Pick a send time at least 5 minutes from now.', 'sendAt');
    const ctx = ctxOrThrow(userId);
    const report = batchesApi.report(input.batchId);
    const targets = input.audience === 'low_attendance' ? report.low.map((x) => x.person) : membersOf(input.batchId).filter((p) => memberEntry(p, input.batchId).status !== 'pending');
    if (input.pinned) db.announcements.forEach((a) => a.batchId === input.batchId && (a.pinned = false));
    const a: Announcement = {
      id: input.id ?? uid('an'), tenantId: ctx.tenant.id, batchId: input.batchId, title: input.title.trim(), body: input.body.trim(), kind: input.kind, pinned: input.pinned,
      status: input.mode === 'send' ? 'sent' : input.mode === 'schedule' ? 'scheduled' : 'draft', createdAt: new Date().toISOString(), sendAt: input.sendAt, audience: input.audience,
      reached: input.mode === 'send' ? targets.length : 0, by: db.users.find((u) => u.id === userId)?.name ?? 'Educator',
    };
    db.announcements = db.announcements.filter((x) => x.id !== a.id);
    db.announcements.push(a);
    if (input.mode === 'send') targets.forEach((p) => notifyPerson(p, a.title, a.body, a.kind === 'class' ? 'live' : 'course'));
    persist();
    return a;
  },

  deleteAnnouncement(id: string) {
    db.announcements = db.announcements.filter((a) => a.id !== id);
    persist();
  },
  pinAnnouncement(id: string) {
    const a = db.announcements.find((x) => x.id === id)!;
    const on = !a.pinned;
    db.announcements.forEach((x) => x.batchId === a.batchId && (x.pinned = false));
    a.pinned = on;
    persist();
  },
};

export const people = {
  async list(userId: string) {
    await wait(220);
    const ctx = ctxOrThrow(userId);
    const mine = new Set(educator.courses(userId).map((c) => c.id));
    return db.people
      .filter((p) => p.tenantId === ctx.tenant.id && p.courses.some((c) => mine.has(c.courseId)))
      .map((p) => {
        const main = p.courses.find((c) => mine.has(c.courseId))!;
        const course = seedCourses.find((c) => c.id === main.courseId)!;
        const batch = main.batchId ? db.batches.find((b) => b.id === main.batchId) : null;
        const inactive = Date.now() - new Date(p.lastActiveAt).getTime() > 14 * 864e5 && main.status === 'active';
        const status: 'active' | 'completed' | 'inactive' | 'pending' | 'on_hold' = main.status === 'pending' ? 'pending' : main.status === 'on_hold' ? 'on_hold' : p.courses.every((c) => c.status === 'completed') ? 'completed' : inactive ? 'inactive' : 'active';
        return { person: p, course, batch, progress: personProgress(p, main.courseId), status, isNew: Date.now() - new Date(p.joinedAt).getTime() < 7 * 864e5 };
      })
      .sort((a, b) => a.person.name.localeCompare(b.person.name));
  },

  profile(userId: string, personId: string) {
    const ctx = ctxOrThrow(userId);
    const p = db.people.find((x) => x.id === personId && x.tenantId === ctx.tenant.id);
    if (!p) return null;
    const enrolled = p.courses.map((pc) => {
      const course = seedCourses.find((c) => c.id === pc.courseId)!;
      const batch = pc.batchId ? db.batches.find((b) => b.id === pc.batchId) ?? null : null;
      const progress = personProgress(p, pc.courseId);
      const marks = pc.batchId ? marksFor(p.id, pc.batchId) : [];
      return { pc, course, batch, progress, marks, attendance: attendancePct(marks) };
    });
    const allMarks = enrolled.flatMap((e) => e.marks);
    const lessonsTotal = enrolled.reduce((s, e) => s + allLessons(e.course).length, 0);
    const lessonsDone = enrolled.reduce((s, e) => s + Math.round((allLessons(e.course).length * e.progress) / 100), 0);
    // real learners: assessment scores from their attempts; demo learners: seeded
    const realScores = p.userId
      ? db.attempts.filter((a) => a.userId === p.userId).map((a) => ({ title: ASSESSMENTS.find((x) => x.id === a.assessmentId)?.title ?? 'Quiz', pct: a.scorePct as number | null }))
      : [];
    const scores = realScores.length ? realScores : p.scores;
    const subs = p.userId ? db.submissions.filter((s) => s.userId === p.userId) : [];
    const activity = p.userId
      ? db.enrollments.filter((e) => e.userId === p.userId).flatMap((e) => {
          const c = seedCourses.find((x) => x.id === e.courseId)!;
          return e.completedLessonIds.slice(-3).reverse().map((lid) => ({ text: `Completed: ${allLessons(c).find((l) => l.id === lid)?.title ?? 'lesson'}`, at: e.lastActiveAt ?? e.enrolledAt, icon: 'checkmark-circle' }));
        })
      : [
          { text: `Completed: ${allLessons(enrolled[0].course)[Math.max(0, Math.round((allLessons(enrolled[0].course).length * enrolled[0].progress) / 100) - 1)]?.title ?? 'Introduction'}`, at: p.lastActiveAt, icon: 'checkmark-circle' },
          { text: 'Watched a recorded lesson', at: new Date(new Date(p.lastActiveAt).getTime() - 864e5).toISOString(), icon: 'play-circle' },
        ];
    return {
      person: p,
      enrolled,
      overall: lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
      lessons: { done: lessonsDone, total: lessonsTotal },
      attendance: { attended: allMarks.filter((m) => m.status !== 'absent').length, total: allMarks.length, pct: attendancePct(allMarks) },
      scores,
      avgScore: scores.filter((s) => s.pct != null).length ? Math.round(scores.filter((s) => s.pct != null).reduce((s, x) => s + (x.pct ?? 0), 0) / scores.filter((s) => s.pct != null).length) : null,
      assignments: p.userId ? { submitted: subs.filter((s) => s.status !== 'draft').length, total: ASSESSMENTS.filter((a) => a.kind === 'assignment' && p.courses.some((c) => c.courseId === a.courseId)).length } : { submitted: 3, total: 4 },
      certificates: p.courses.filter((c) => c.status === 'completed' || personProgress(p, c.courseId) === 100).length,
      activity,
    };
  },

  addNote(userId: string, personId: string, text: string) {
    if (text.trim().length < 3) throw new ApiError('note', 'Write a note first.');
    const p = db.people.find((x) => x.id === personId)!;
    p.notes.unshift({ id: uid('pn'), text: text.trim(), at: new Date().toISOString(), by: db.users.find((u) => u.id === userId)?.name ?? 'Educator' });
    persist();
  },

  async message(userId: string, personId: string, text: string) {
    await wait(400);
    if (text.trim().length < 3) throw new ApiError('message', 'Write a message first.');
    const p = db.people.find((x) => x.id === personId)!;
    const from = db.users.find((u) => u.id === userId)?.name ?? 'Your tutor';
    notifyPerson(p, `Message from ${from}`, text.trim(), 'course');
    persist();
    return { delivered: p.userId ? 'in_app' : 'email' };
  },

  /** Invite a new student by email/phone (counts against the active-student limit). */
  async invite(userId: string, input: { name: string; email: string; phone: string; batchId?: string; courseId: string }) {
    await wait(450);
    const ctx = ctxOrThrow(userId);
    if (input.name.trim().length < 2) throw new ApiError('name', 'Enter the student’s name.', 'name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) throw new ApiError('email', 'Enter a valid email.', 'email');
    if (db.people.some((p) => p.tenantId === ctx.tenant.id && p.email.toLowerCase() === input.email.trim().toLowerCase())) throw new ApiError('email', 'This student is already in your workspace. Add them from the list instead.', 'email');
    if (input.batchId) {
      const r = batchesApi.get(userId, input.batchId);
      if (r && r.counts.enrolled >= r.batch.capacity) throw new ApiError('capacity', 'This batch is full. Increase capacity or pick another batch.');
    }
    consumeStudentSeat(ctx.tenant.id);
    const p: Person = {
      id: uid('p'), tenantId: ctx.tenant.id, name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone ? (input.phone.startsWith('+') ? input.phone : `+91${input.phone.replace(/\D/g, '')}`) : '',
      enrollmentId: `ENR${String(db.people.length + 300).padStart(5, '0')}`, joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      courses: [{ courseId: input.courseId, batchId: input.batchId, progress: 0, enrolledAt: new Date().toISOString(), status: 'active' }], learningMinutes: 0, streak: 0, scores: [], notes: [],
    };
    db.people.push(p);
    persist();
    return p;
  },

  /** CSV: name,email,phone per line. Returns per-row result so the educator can fix bad rows. */
  async importCsv(userId: string, text: string, courseId: string, batchId?: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l, i) => !(i === 0 && /name/i.test(l) && /email/i.test(l)));
    const results: { line: string; ok: boolean; reason?: string }[] = [];
    for (const line of lines) {
      const [name = '', email = '', phone = ''] = line.split(',').map((x) => x.trim());
      try {
        await people.invite(userId, { name, email, phone, courseId, batchId });
        results.push({ line, ok: true });
      } catch (e) {
        results.push({ line, ok: false, reason: (e as ApiError).message });
        if ((e as ApiError).code === 'limit') break;
      }
    }
    return results;
  },
};

/** Helpers for the Create batch screen (keeps screens off the mock DB). */
export const batchForm = {
  team(userId: string) {
    const ctx = educator.context(userId);
    return db.memberships.filter((m) => m.tenantId === ctx?.tenant.id && (m.role === 'owner' || m.role === 'tutor')).map((m) => ({ ...db.users.find((u) => u.id === m.userId)!, role: m.role }));
  },
  candidates(userId: string, courseId: string) {
    const ctx = educator.context(userId);
    return ctx ? db.people.filter((p) => p.tenantId === ctx.tenant.id && !p.courses.some((pc) => pc.courseId === courseId && pc.batchId)) : [];
  },
  countForCourse: (courseId: string) => db.batches.filter((b) => b.courseId === courseId).length,
};

/* ───────────────────────── Educator live classes (E4) ───────────────────────── */

export type LiveState = 'live' | 'upcoming' | 'conducted' | 'cancelled';
export interface UnifiedSession {
  id: string;
  kind: 'batch' | 'course';
  courseId: string;
  batchId?: string;
  batchName?: string;
  title: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  mode: 'online' | 'offline';
  state: LiveState;
  instructorId?: string;
  settings: NonNullable<ClassSession['settings']>;
}
const LIVE_DEFAULTS = { record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true };

function stateOf(startsAt: string, endsAt: string, stored?: 'scheduled' | 'conducted' | 'cancelled'): LiveState {
  if (stored === 'cancelled') return 'cancelled';
  if (stored === 'conducted') return 'conducted';
  const now = Date.now();
  if (now >= new Date(startsAt).getTime() && now < new Date(endsAt).getTime()) return 'live';
  if (now >= new Date(endsAt).getTime()) return 'conducted';
  return 'upcoming';
}

/** All live sessions (batch classes + course-wide sessions) normalised to one shape. */
function unified(): UnifiedSession[] {
  const fromBatch = db.classSessions.map((s) => {
    const b = db.batches.find((x) => x.id === s.batchId);
    return { id: s.id, kind: 'batch' as const, courseId: b?.courseId ?? '', batchId: s.batchId, batchName: b?.name, title: s.title, topic: s.topic, startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode, state: stateOf(s.startsAt, s.endsAt, s.status), instructorId: s.instructorId, settings: s.settings ?? LIVE_DEFAULTS };
  });
  const fromCourse = seedLive.map((s) => ({ id: s.id, kind: 'course' as const, courseId: s.courseId, title: s.title, topic: s.title, startsAt: s.startsAt, endsAt: s.endsAt, mode: 'online' as const, state: stateOf(s.startsAt, s.endsAt, db.sessionStatus[s.id]), settings: LIVE_DEFAULTS }));
  return [...fromBatch, ...fromCourse];
}

function canHost(userId: string, s: UnifiedSession) {
  const ctx = educator.context(userId);
  if (!ctx) return false;
  const course = seedCourses.find((c) => c.id === s.courseId);
  if (!course || course.tenantId !== ctx.tenant.id) return false;
  if (ctx.role === 'owner') return true;
  if (s.batchId) return !!db.batches.find((b) => b.id === s.batchId)?.instructorIds.includes(userId);
  return db.tutorAssignments.some((a) => a.userId === userId && a.courseId === s.courseId);
}

/** People expected in a session (batch roster, or enrolled learners for course-wide sessions). */
function audienceOf(s: UnifiedSession) {
  if (s.batchId) return db.people.filter((p) => p.courses.some((c) => c.batchId === s.batchId && c.status !== 'pending'));
  return db.people.filter((p) => p.courses.some((c) => c.courseId === s.courseId && c.status !== 'pending'));
}

const hoursOf = (s: { startsAt: string; endsAt: string }) => (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 36e5;

export const liveAdmin = {
  /** Host token. Real: POST live-token (role resolves to 'host' for the academy's educators). Mock: no media server. */
  async joinHost(userId: string, sessionId: string) {
    await wait(300);
    if (!canHost(userId, unified().find((x) => x.id === sessionId)!)) throw new ApiError('forbidden', 'You can’t host this class.');
    return { provider: 'loopback' as 'loopback' | 'livekit', url: '', token: uid('host') };
  },

  /** Class settings (recording, chat, Q&A…) — the student room reads `record` to show the REC badge. */
  settingsOf: (sessionId: string) => unified().find((x) => x.id === sessionId)?.settings ?? null,

  /** Host approves (or withdraws) a raised hand. Real: insert/delete a live_speakers row, then the learner's next token carries canPublish. */
  allowSpeaker(userId: string, sessionId: string, learnerId: string, on: boolean) {
    const s = unified().find((x) => x.id === sessionId);
    if (!s || !canHost(userId, s)) throw new ApiError('forbidden', 'You can’t host this class.');
    on ? speakers.add(`${sessionId}:${learnerId}`) : speakers.delete(`${sessionId}:${learnerId}`);
  },

  /**
   * Store a file the host shares during class and return the link learners download from.
   * Mock: the picked file's own URI. Real: upload to the `live-files` bucket + insert a live_files row; learners get a signed URL.
   */
  async uploadMaterial(userId: string, sessionId: string, file: { name: string; sizeBytes: number; uri: string }) {
    await wait(200);
    const s = unified().find((x) => x.id === sessionId);
    if (!s || !canHost(userId, s)) throw new ApiError('forbidden', 'You can’t share files in this class.');
    if (file.sizeBytes > 50 * 1024 * 1024) throw new ApiError('size', 'Files can be up to 50 MB.');
    return { id: uid('lf'), name: file.name.slice(0, 120), size: file.sizeBytes, url: file.uri };
  },
  async list(userId: string) {
    await wait(220);
    const rows = unified().filter((s) => canHost(userId, s)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const ctx = educator.context(userId)!;
    const hours = ctx.usage.rows.find((r) => r.key === 'liveHours')!;
    const conducted = rows.filter((r) => r.state === 'conducted');
    const marks = db.batchAttendance.filter((m) => conducted.some((s) => s.id === m.sessionId));
    return {
      live: rows.filter((r) => r.state === 'live'),
      upcoming: rows.filter((r) => r.state === 'upcoming'),
      conducted: conducted.reverse(),
      cancelled: rows.filter((r) => r.state === 'cancelled'),
      stats: { total: rows.length, conducted: conducted.length, upcoming: rows.filter((r) => r.state === 'upcoming').length, attendance: attendancePct(marks) },
      hours,
      courseOf: (id: string) => seedCourses.find((c) => c.id === id)!,
    };
  },

  get(userId: string, id: string) {
    const s = unified().find((x) => x.id === id);
    if (!s || !canHost(userId, s)) return null;
    return { session: s, course: seedCourses.find((c) => c.id === s.courseId)!, audience: audienceOf(s), summary: db.sessionSummaries[id] ?? null, ctx: educator.context(userId)! };
  },

  hostableBatches(userId: string) {
    return visibleBatches(userId).filter((b) => batchStatus(b) !== 'completed');
  },

  /** Schedule a class. Enforces the live room-hours limit (100% → no new classes) and same-batch clashes. */
  async schedule(userId: string, input: { batchId: string; title: string; description: string; startsAt: string; durationMin: number; instructorId: string; mode: 'online' | 'offline'; settings: UnifiedSession['settings']; notifyNow: boolean; reminders: number[] }) {
    await wait(500);
    if (!db.flags.liveClasses) throw new ApiError('paused', 'Scheduling live classes is paused by Bodhin right now.');
    const ctx = ctxOrThrow(userId);
    const b = visibleBatches(userId).find((x) => x.id === input.batchId);
    if (!b) throw new ApiError('batch', 'Choose a batch.', 'batch');
    if (input.title.trim().length < 4) throw new ApiError('title', 'Add a class title (4+ characters).', 'title');
    const start = new Date(input.startsAt).getTime();
    if (start < Date.now() + 5 * 6e4) throw new ApiError('time', 'Pick a start time at least 5 minutes from now.', 'time');
    const endsAt = new Date(start + input.durationMin * 6e4).toISOString();
    const clash = db.classSessions.find((s) => s.batchId === b.id && s.status !== 'cancelled' && new Date(s.startsAt).getTime() < new Date(endsAt).getTime() && new Date(s.endsAt).getTime() > start);
    if (clash) throw new ApiError('time', `Clashes with “${clash.title}” (${new Date(clash.startsAt).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}). Pick another time.`, 'time');
    if (input.mode === 'online') {
      const h = ctx.usage.rows.find((r) => r.key === 'liveHours')!;
      if (h.limit != null && h.used + input.durationMin / 60 > h.limit) throw new ApiError('limit', `Not enough live room-hours this month (${h.used} of ${h.limit} h used). Add a live-hours top-up or upgrade. Classes already scheduled are not affected.`);
    }
    const no = db.classSessions.filter((s) => s.batchId === b.id).length + 1;
    const s: ClassSession = {
      id: uid('s'), batchId: b.id, no, title: input.title.trim(), topic: input.title.trim(), description: input.description.trim() || undefined, startsAt: new Date(start).toISOString(), endsAt,
      mode: input.mode, status: 'scheduled', instructorId: input.instructorId, settings: input.settings, reminders: input.reminders,
    };
    db.classSessions.push(s);
    if (input.notifyNow) membersOf(b.id).filter((p) => memberEntry(p, b.id).status !== 'pending').forEach((p) => notifyPerson(p, 'New live class scheduled', `${s.title} · ${new Date(s.startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, 'live'));
    persist();
    return s.id;
  },

  /** Host goes live: learners get a "class is live" notification (real: push + realtime room). */
  start(userId: string, id: string) {
    const r = liveAdmin.get(userId, id);
    if (!r) throw new ApiError('forbidden', 'You can’t host this class.');
    if (r.session.kind === 'batch') {
      const row = db.classSessions.find((x) => x.id === id)!;
      if (row.status === 'cancelled') throw new ApiError('cancelled', 'This class was cancelled. Restore it from the batch schedule first.');
    }
    r.audience.forEach((p) => notifyPerson(p, 'Your class is live now', `${r.session.title} has started. Tap to join.`, 'live'));
    persist();
    return r;
  },

  /** Ends a class: attendance from join logs, live-hour usage, summary for the recording page. */
  end(userId: string, id: string, data: { elapsedSec: number; peak: number; chapters: LiveSummary['chapters']; materials: LiveSummary['materials']; qa: LiveSummary['qa']; polls: LiveSummary['polls']; chatCount: number }) {
    const r = liveAdmin.get(userId, id);
    if (!r) throw new ApiError('forbidden', 'You can’t end this class.');
    const s = r.session;
    let attended = 0;
    if (s.kind === 'batch') {
      const row = db.classSessions.find((x) => x.id === id)!;
      row.status = 'conducted';
      row.recording = s.settings.record;
      if (s.settings.trackAttendance) {
        const marks = batchesApi.importFromLive(id);
        batchesApi.saveAttendance(id, marks);
        attended = marks.filter((m) => m.status !== 'absent').length;
      }
    } else {
      db.sessionStatus[id] = 'conducted';
      attended = Math.min(r.audience.length, Math.max(1, data.peak));
    }
    if (s.mode === 'online') {
      const u = db.usage[r.ctx.tenant.id];
      if (u) u.liveHours = Math.round((u.liveHours + Math.max(0.25, data.elapsedSec / 3600)) * 10) / 10;
    }
    const course = r.course;
    db.sessionSummaries[id] = {
      sessionId: id, endedAt: new Date().toISOString(), durationSec: Math.max(60, data.elapsedSec), peak: data.peak, attended, total: r.audience.length,
      text: `In this session we covered ${s.topic}. We walked through the key ideas with examples from ${course.title}, answered ${data.qa.length} questions and ran ${data.polls.length} live poll${data.polls.length === 1 ? '' : 's'}.`,
      takeaways: [`${s.topic}: core concepts and where it fits`, 'A worked example you can reuse', 'Common mistakes and how to avoid them'],
      chapters: data.chapters.length ? data.chapters : [{ atSec: 0, label: 'Class introduction' }],
      materials: data.materials, qa: data.qa, polls: data.polls, chatCount: data.chatCount, recordingPublished: s.settings.record && s.settings.saveToCourse,
    };
    speakers.forEach((k) => k.startsWith(`${id}:`) && speakers.delete(k));
    db.activity.push({ id: uid('act'), tenantId: r.ctx.tenant.id, kind: 'live', text: `Live class “${s.title}” completed · ${attended}/${r.audience.length} attended`, at: new Date().toISOString(), link: { pathname: '/edu/summary/[id]', params: { id } } });
    persist();
  },

  /** Summary for a conducted class (builds a default for older classes without one). */
  summary(userId: string, id: string) {
    const r = liveAdmin.get(userId, id);
    if (!r) return null;
    const s = r.session;
    let sum = db.sessionSummaries[id];
    if (!sum) {
      const marks = db.batchAttendance.filter((m) => m.sessionId === id);
      sum = {
        sessionId: id, endedAt: s.endsAt, durationSec: Math.round(hoursOf(s) * 3600), peak: marks.length || r.audience.length, attended: marks.filter((m) => m.status !== 'absent').length || Math.round(r.audience.length * 0.9), total: marks.length || r.audience.length,
        text: `This class covered ${s.topic}, with examples and a Q&A round at the end.`,
        takeaways: [`Key ideas of ${s.topic}`, 'Practical steps to apply this week', 'Questions to explore before the next class'],
        chapters: [{ atSec: 0, label: 'Class introduction' }],
        materials: [],
        qa: [],
        polls: [], chatCount: 0, recordingPublished: false,
      };
    }
    const marks = s.kind === 'batch' ? batchesApi.attendance(id) : [];
    const sessions = unified().filter((x) => (s.batchId ? x.batchId === s.batchId : x.courseId === s.courseId) && x.state === 'upcoming').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { ...r, sum, marks, next: sessions[0] ?? null };
  },

  updateSummary(id: string, patch: Partial<LiveSummary>) {
    const cur = db.sessionSummaries[id];
    if (cur) db.sessionSummaries[id] = { ...cur, ...patch };
    persist();
  },

  async shareSummary(userId: string, id: string) {
    const r = liveAdmin.summary(userId, id);
    if (!r) throw new ApiError('forbidden', 'No access.');
    if (!db.sessionSummaries[id]) db.sessionSummaries[id] = r.sum;
    db.sessionSummaries[id].sharedAt = new Date().toISOString();
    if (!r.session.batchId) r.audience.forEach((p) => notifyPerson(p, `Recording ready: ${r.session.title}`, 'Watch it in your Live tab → Past & Attendance.', 'live'));
    else await batchesApi.announce(userId, { batchId: r.session.batchId, title: `Recording & notes: ${r.session.title}`, body: `${r.sum.text} Watch the recording in your Live tab → Past & Attendance.`, kind: 'recording', pinned: false, audience: 'batch', mode: 'send' });
    persist();
  },

  /** For the student live room: who is in the class. */
  audience: (id: string) => {
    const s = unified().find((x) => x.id === id);
    return s ? audienceOf(s) : [];
  },
};

/** Student-side view of batch classes (merged into the student's Live tab). */
export function studentBatchSessions(userId: string) {
  const p = db.people.find((x) => x.userId === userId);
  if (!p) return [];
  const ids = new Set(p.courses.filter((c) => c.batchId && c.status !== 'pending').map((c) => c.batchId!));
  return db.classSessions
    .filter((s) => ids.has(s.batchId) && s.status !== 'cancelled')
    .map((s) => {
      const mark = db.batchAttendance.find((m) => m.sessionId === s.id && m.personId === p.id);
      return { s, mark };
    });
}

/* ───────────────────────── Assessments, grading & doubts (E5) ───────────────────────── */

const isDemoUser = (userId: string) => !userId.startsWith('person:');
/** Display name for a submission/attempt author (real account or workspace student). */
function learnerName(userId: string) {
  if (userId.startsWith('person:')) return db.people.find((p) => p.id === userId.slice(7))?.name ?? 'Student';
  return db.users.find((u) => u.id === userId)?.name ?? 'Student';
}
function personFor(userId: string) {
  return userId.startsWith('person:') ? db.people.find((p) => p.id === userId.slice(7)) ?? null : db.people.find((p) => p.userId === userId) ?? null;
}
function saveAssessment(a: Assessment) {
  a.updatedAt = new Date().toISOString();
  const i = db.assessments.findIndex((x) => x.id === a.id);
  i >= 0 ? (db.assessments[i] = a) : db.assessments.push(a);
  syncAssessments();
  persist();
}
function ownedAssessment(userId: string, id: string) {
  const a = ASSESSMENTS.find((x) => x.id === id);
  if (!a) throw new ApiError('not_found', 'Assessment not found.');
  if (!educator.courses(userId).some((c) => c.id === a.courseId)) throw new ApiError('forbidden', 'You can’t edit assessments for this course.');
  return a;
}
/** Learners who should receive an assessment (course enrolments + batch members with accounts). */
function recipientsOf(a: Assessment) {
  const ids = new Set<string>();
  db.enrollments.filter((e) => e.courseId === a.courseId).forEach((e) => ids.add(e.userId));
  if (a.batchId) {
    const inBatch = new Set(db.people.filter((p) => p.courses.some((c) => c.batchId === a.batchId)).map((p) => p.userId).filter(Boolean) as string[]);
    for (const id of [...ids]) if (!inBatch.has(id)) ids.delete(id);
  }
  return [...ids].filter((id) => db.users.some((u) => u.id === id && u.id !== a.createdBy));
}
function audienceCount(a: Assessment) {
  return db.people.filter((p) => p.courses.some((c) => c.courseId === a.courseId && c.status !== 'pending' && (!a.batchId || c.batchId === a.batchId))).length;
}

export type AssessDraftKind = 'quiz' | 'exam' | 'assignment';

export const assessAdmin = {
  async list(userId: string) {
    await wait(220);
    const courses = educator.courses(userId);
    const ids = new Set(courses.map((c) => c.id));
    const rows = ASSESSMENTS.filter((a) => ids.has(a.courseId)).map((a) => {
      const subs = db.submissions.filter((s) => s.assessmentId === a.id && s.status !== 'draft');
      const atts = db.attempts.filter((t) => t.assessmentId === a.id);
      const scores = a.kind === 'assignment' ? subs.filter((s) => s.grade).map((s) => s.grade!.pct) : atts.map((t) => t.scorePct);
      return {
        a,
        course: courses.find((c) => c.id === a.courseId)!,
        batch: a.batchId ? db.batches.find((b) => b.id === a.batchId) ?? null : null,
        status: a.status ?? 'published',
        toGrade: subs.filter((s) => s.status === 'submitted').length,
        responses: a.kind === 'assignment' ? subs.length : new Set(atts.map((t) => t.userId)).size,
        audience: audienceCount(a),
        avg: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
      };
    });
    rows.sort((x, y) => (x.status === 'draft' ? -1 : 0) - (y.status === 'draft' ? -1 : 0) || (y.a.updatedAt ?? '').localeCompare(x.a.updatedAt ?? '') || y.toGrade - x.toGrade);
    return { rows, courses, toGrade: rows.reduce((s, r) => s + r.toGrade, 0) };
  },

  get(userId: string, id: string) {
    try {
      const a = ownedAssessment(userId, id);
      return { a, course: seedCourses.find((c) => c.id === a.courseId)!, questions: questionsOf(a), batches: db.batches.filter((b) => b.courseId === a.courseId), locked: assessAdmin.hasResponses(a.id) };
    } catch {
      return null;
    }
  },

  hasResponses: (id: string) => db.attempts.some((t) => t.assessmentId === id) || db.submissions.some((s) => s.assessmentId === id && s.status !== 'draft'),

  create(userId: string, kind: AssessDraftKind, courseId: string) {
    if (!educator.courses(userId).some((c) => c.id === courseId)) throw new ApiError('forbidden', 'Choose one of your courses.');
    const a: Assessment = {
      id: uid(kind === 'assignment' ? 'asg' : kind === 'exam' ? 'ex' : 'qz'), courseId, kind, title: '', marks: kind === 'assignment' ? 20 : 0, passPct: 60, status: 'draft', batchId: null, createdBy: userId,
      ...(kind === 'assignment'
        ? { instructions: '', requirements: [], resources: [], accepts: ['PDF', 'DOCX'], maxMb: 25, dueAt: new Date(Date.now() + 7 * 864e5).toISOString(), rubric: [{ item: 'Quality of work', max: 10 }, { item: 'Meets the brief', max: 10 }], settings: { shuffle: false, attempts: 1, showAnswers: false, lateAllowed: true } }
        : { durationMin: kind === 'exam' ? 60 : 15, questionIds: [], settings: { shuffle: kind === 'exam', attempts: kind === 'exam' ? 1 : 0, showAnswers: kind === 'quiz', lateAllowed: false }, ...(kind === 'exam' ? { opensAt: new Date(Date.now() + 3 * 864e5).toISOString() } : {}) }),
    };
    saveAssessment(a);
    return a.id;
  },

  update(userId: string, id: string, patch: Partial<Assessment>) {
    const a = { ...ownedAssessment(userId, id), ...patch };
    if (a.kind === 'assignment' && a.rubric) a.marks = a.rubric.reduce((s, r) => s + r.max, 0);
    if (a.kind !== 'assignment' && a.createdBy) a.marks = (a.questionIds ?? []).length * (a.kind === 'exam' ? 2 : 1);
    saveAssessment(a);
    return a;
  },

  upsertQuestion(userId: string, id: string, q: Omit<Question, 'id'> & { id?: string }) {
    const a = ownedAssessment(userId, id);
    if (q.text.trim().length < 5) throw new ApiError('text', 'Write the question (5+ characters).', 'text');
    const options = q.options.map((o) => o.trim());
    if (options.filter(Boolean).length < 2 || options.some((o) => !o)) throw new ApiError('options', 'Fill every option (at least 2).', 'options');
    if (q.correct < 0 || q.correct >= options.length) throw new ApiError('correct', 'Tap the circle next to the correct answer.', 'options');
    // Editing a seed question creates a custom copy so other assessments are not affected.
    const ownCustom = q.id && db.customQuestions.some((x) => x.id === q.id) && !ASSESSMENTS.some((x) => x.id !== id && x.questionIds?.includes(q.id!));
    const qid = ownCustom ? q.id! : uid('q');
    const row: Question = { id: qid, text: q.text.trim(), options, correct: q.correct, topic: q.topic.trim() || 'General', explanation: q.explanation.trim(), hint: q.hint?.trim() || undefined };
    const i = db.customQuestions.findIndex((x) => x.id === qid);
    i >= 0 ? (db.customQuestions[i] = row) : db.customQuestions.push(row);
    syncAssessments();
    const list = [...(a.questionIds ?? [])];
    if (q.id && list.includes(q.id)) list[list.indexOf(q.id)] = qid;
    else list.push(qid);
    assessAdmin.update(userId, id, { questionIds: list });
    return qid;
  },
  removeQuestion(userId: string, id: string, qid: string) {
    const a = ownedAssessment(userId, id);
    assessAdmin.update(userId, id, { questionIds: (a.questionIds ?? []).filter((x) => x !== qid) });
  },
  moveQuestion(userId: string, id: string, qid: string, dir: -1 | 1) {
    const list = [...(ownedAssessment(userId, id).questionIds ?? [])];
    const i = list.indexOf(qid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    assessAdmin.update(userId, id, { questionIds: list });
  },
  /** Question bank: every question already used in this course's assessments. */
  bank(userId: string, id: string) {
    const a = ownedAssessment(userId, id);
    const used = new Set(a.questionIds ?? []);
    const ids = new Set(ASSESSMENTS.filter((x) => x.courseId === a.courseId).flatMap((x) => x.questionIds ?? []));
    return [...ids].filter((q) => !used.has(q)).map((q) => QUESTIONS.find((x) => x.id === q)!).filter(Boolean);
  },
  importQuestions(userId: string, id: string, qids: string[]) {
    const a = ownedAssessment(userId, id);
    assessAdmin.update(userId, id, { questionIds: [...(a.questionIds ?? []), ...qids.filter((q) => !(a.questionIds ?? []).includes(q))] });
  },

  checklist(a: Assessment) {
    const out: { ok: boolean; text: string }[] = [{ ok: a.title.trim().length >= 4, text: 'Title (4+ characters)' }];
    if (a.kind === 'assignment') {
      out.push({ ok: (a.instructions ?? '').trim().length >= 20, text: 'Instructions (20+ characters)' });
      out.push({ ok: !!a.dueAt && new Date(a.dueAt).getTime() > Date.now(), text: 'Due date in the future' });
      out.push({ ok: (a.rubric ?? []).length > 0 && a.marks > 0, text: 'Grading rubric with marks' });
    } else {
      out.push({ ok: (a.questionIds ?? []).length >= 3, text: 'At least 3 questions' });
      out.push({ ok: (a.durationMin ?? 0) >= 5, text: 'Time limit (5+ minutes)' });
      if (a.kind === 'exam') out.push({ ok: !!a.opensAt, text: 'Exam opening date & time' });
    }
    return out;
  },

  async publish(userId: string, id: string) {
    await wait(500);
    const a = ownedAssessment(userId, id);
    const miss = assessAdmin.checklist(a).filter((x) => !x.ok);
    if (miss.length) throw new ApiError('incomplete', `Finish: ${miss.map((m) => m.text.toLowerCase()).join(', ')}.`);
    assessAdmin.update(userId, id, { status: 'published' });
    const label = a.kind === 'assignment' ? 'New assignment' : a.kind === 'exam' ? 'Exam scheduled' : 'New quiz';
    const when = a.kind === 'assignment' ? ` · due ${new Date(a.dueAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : a.kind === 'exam' ? ` · opens ${new Date(a.opensAt!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : '';
    const path = a.kind === 'assignment' ? '/assignment/[id]' : '/quiz/[id]';
    recipientsOf(a).forEach((u) => db.notifications.push({ id: uid('n'), userId: u, kind: 'grade', title: `${label}: ${a.title}`, body: `${seedCourses.find((c) => c.id === a.courseId)!.title}${when}`, at: new Date().toISOString(), read: false, link: { pathname: path, params: { id } } }));
    const ctx = ctxOrThrow(userId);
    db.activity.push({ id: uid('act'), tenantId: ctx.tenant.id, kind: 'submission', text: `${label} published: “${a.title}” · ${audienceCount(a)} students`, at: new Date().toISOString() });
    persist();
  },
  unpublish(userId: string, id: string) {
    if (assessAdmin.hasResponses(id)) throw new ApiError('locked', 'Students have already responded, so this can’t go back to draft. Close it by changing the due date instead.');
    assessAdmin.update(userId, id, { status: 'draft' });
  },
  duplicate(userId: string, id: string) {
    const a = ownedAssessment(userId, id);
    const copy: Assessment = { ...a, id: uid(a.kind === 'assignment' ? 'asg' : 'qz'), title: `${a.title} (copy)`, status: 'draft', lessonId: undefined, createdBy: userId, questionIds: a.questionIds ? [...a.questionIds] : undefined };
    saveAssessment(copy);
    return copy.id;
  },
  remove(userId: string, id: string) {
    const a = ownedAssessment(userId, id);
    if (a.status !== 'draft' || a.lessonId) throw new ApiError('locked', 'Only drafts can be deleted.');
    db.assessments = db.assessments.filter((x) => x.id !== id);
    const i = ASSESSMENTS.findIndex((x) => x.id === id);
    if (i >= 0) ASSESSMENTS.splice(i, 1);
    persist();
  },

  /** Quiz/exam results: best attempt per learner, pass rate and question-wise accuracy. */
  results(userId: string, id: string) {
    const a = ownedAssessment(userId, id);
    const qs = questionsOf(a);
    const best = new Map<string, Attempt>();
    db.attempts.filter((t) => t.assessmentId === id).forEach((t) => {
      const b = best.get(t.userId);
      if (!b || t.scorePct > b.scorePct) best.set(t.userId, t);
    });
    const rows = [...best.values()].sort((x, y) => y.scorePct - x.scorePct).map((t) => ({ t, name: learnerName(t.userId) }));
    const all = db.attempts.filter((t) => t.assessmentId === id && t.answers.length === qs.length);
    const perQ = qs.map((q, i) => ({ q, pct: all.length ? Math.round((all.filter((t) => t.answers[i] === q.correct).length / all.length) * 100) : null }));
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.t.scorePct, 0) / rows.length) : null;
    return { rows, perQ, avg, pass: rows.length ? Math.round((rows.filter((r) => r.t.scorePct >= a.passPct).length / rows.length) * 100) : null, audience: audienceCount(a), avgTime: rows.length ? Math.round(rows.reduce((s, r) => s + r.t.timeTakenSec, 0) / rows.length / 60) : null };
  },
};

export type QueueFilter = 'to_grade' | 'graded' | 'returned';

export const grading = {
  async queue(userId: string, filter: QueueFilter, assessmentId?: string) {
    await wait(200);
    const ids = new Set(educator.courses(userId).map((c) => c.id));
    const asg = ASSESSMENTS.filter((a) => a.kind === 'assignment' && ids.has(a.courseId));
    const subs = db.submissions.filter((s) => asg.some((a) => a.id === s.assessmentId) && (!assessmentId || s.assessmentId === assessmentId));
    const pick = (f: QueueFilter) => subs.filter((s) => (f === 'to_grade' ? s.status === 'submitted' : f === 'graded' ? s.status === 'graded' : s.status === 'draft' && !!s.returnNote));
    const rows = pick(filter)
      .map((s) => {
        const a = asg.find((x) => x.id === s.assessmentId)!;
        return { s, a, name: learnerName(s.userId), late: !!(s.submittedAt && a.dueAt && s.submittedAt > a.dueAt) };
      })
      .sort((x, y) => (filter === 'to_grade' ? (x.s.submittedAt ?? '').localeCompare(y.s.submittedAt ?? '') : (y.s.updatedAt ?? '').localeCompare(x.s.updatedAt ?? '')));
    const counts = { to_grade: pick('to_grade').length, graded: pick('graded').length, returned: pick('returned').length };
    const byAssignment = asg.map((a) => ({ a, count: db.submissions.filter((s) => s.assessmentId === a.id && s.status === 'submitted').length })).filter((x) => x.count > 0 || x.a.id === assessmentId);
    return { rows, counts, byAssignment };
  },

  detail(userId: string, subId: string) {
    const s = db.submissions.find((x) => x.id === subId);
    if (!s) return null;
    const a = ASSESSMENTS.find((x) => x.id === s.assessmentId)!;
    if (!educator.courses(userId).some((c) => c.id === a.courseId)) return null;
    const person = personFor(s.userId);
    const queue = db.submissions.filter((x) => x.assessmentId === s.assessmentId && x.status === 'submitted' && x.id !== s.id).sort((x, y) => (x.submittedAt ?? '').localeCompare(y.submittedAt ?? ''));
    const history = db.submissions.filter((x) => x.userId === s.userId && x.grade && x.id !== s.id).map((x) => ({ title: ASSESSMENTS.find((y) => y.id === x.assessmentId)?.title ?? '', pct: x.grade!.pct }));
    return { s, a, course: seedCourses.find((c) => c.id === a.courseId)!, name: learnerName(s.userId), person, rubric: rubricOf(a), late: !!(s.submittedAt && a.dueAt && s.submittedAt > a.dueAt), nextId: queue[0]?.id ?? null, remaining: queue.length, history };
  },

  async grade(userId: string, subId: string, input: { scores: number[]; feedback: string }) {
    await wait(450);
    const d = grading.detail(userId, subId);
    if (!d) throw new ApiError('forbidden', 'You can’t grade this submission.');
    if (input.feedback.trim().length < 5) throw new ApiError('feedback', 'Add a line of feedback so the student knows what to improve.', 'feedback');
    const rubric = d.rubric.map((r, i) => ({ ...r, score: Math.max(0, Math.min(r.max, Math.round(input.scores[i] ?? 0))) }));
    const total = rubric.reduce((s, r) => s + r.max, 0) || 1;
    const pct = Math.round((rubric.reduce((s, r) => s + r.score, 0) / total) * 100);
    const me = db.users.find((u) => u.id === userId)!;
    Object.assign(d.s, { status: 'graded', returnNote: undefined, updatedAt: new Date().toISOString(), grade: { pct, feedback: input.feedback.trim(), rubric, by: me.name, at: new Date().toISOString() } });
    if (isDemoUser(d.s.userId)) db.notifications.push({ id: uid('n'), userId: d.s.userId, kind: 'grade', title: `Assignment graded: ${pct}%`, body: `${me.name} graded “${d.a.title}”.`, at: new Date().toISOString(), read: false, link: { pathname: '/assignment/[id]', params: { id: d.a.id } } });
    persist();
    return { pct, nextId: d.nextId };
  },

  async requestResubmit(userId: string, subId: string, note: string) {
    await wait(400);
    const d = grading.detail(userId, subId);
    if (!d) throw new ApiError('forbidden', 'You can’t return this submission.');
    if (note.trim().length < 5) throw new ApiError('feedback', 'Tell the student what to fix (5+ characters).', 'feedback');
    Object.assign(d.s, { status: 'draft', returnNote: note.trim(), updatedAt: new Date().toISOString() });
    if (isDemoUser(d.s.userId)) db.notifications.push({ id: uid('n'), userId: d.s.userId, kind: 'grade', title: 'Resubmission requested', body: `“${d.a.title}”: ${note.trim()}`, at: new Date().toISOString(), read: false, link: { pathname: '/assignment/[id]', params: { id: d.a.id } } });
    persist();
    return { nextId: d.nextId };
  },
};

export type DoubtFilter = 'open' | 'answered';

export const doubts = {
  async list(userId: string, filter: DoubtFilter, courseId?: string) {
    await wait(200);
    const courses = educator.courses(userId);
    const ids = new Set(courses.map((c) => c.id));
    const all = db.questions.filter((q) => ids.has(q.courseId) && (!courseId || q.courseId === courseId));
    const pick = (f: DoubtFilter) => all.filter((q) => (f === 'open' ? !q.answer : !!q.answer));
    const rows = pick(filter)
      .sort((a, b) => (filter === 'open' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
      .map((q) => {
        const course = courses.find((c) => c.id === q.courseId)!;
        const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === q.lessonId);
        return { q, course, lesson: lesson?.title ?? '', ageH: (Date.now() - new Date(q.createdAt).getTime()) / 36e5 };
      });
    const withOpen = courses.map((c) => ({ c, open: db.questions.filter((q) => q.courseId === c.id && !q.answer).length })).filter((x) => x.open > 0 || x.c.id === courseId);
    return { rows, counts: { open: pick('open').length, answered: pick('answered').length }, courses: withOpen };
  },

  async answer(userId: string, id: string, text: string) {
    await wait(400);
    const q = db.questions.find((x) => x.id === id);
    if (!q || !educator.courses(userId).some((c) => c.id === q.courseId)) throw new ApiError('forbidden', 'You can’t answer this question.');
    if (text.trim().length < 5) throw new ApiError('short', 'Write a short answer (5+ characters).');
    const me = db.users.find((u) => u.id === userId)!;
    q.answer = { by: me.name, text: text.trim(), at: new Date().toISOString() };
    if (isDemoUser(q.userId) && db.users.some((u) => u.id === q.userId)) db.notifications.push({ id: uid('n'), userId: q.userId, kind: 'qa', title: 'Your doubt was answered', body: `${me.name}: ${text.trim().slice(0, 90)}`, at: new Date().toISOString(), read: false, link: { pathname: '/learn/[courseId]', params: { courseId: q.courseId, lesson: q.lessonId } } });
    persist();
  },
};

/* ───────────────────────── Business & workspace settings (E6) ───────────────────────── */

function ownerOrThrow(userId: string) {
  const ctx = ctxOrThrow(userId);
  if (ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can change this.');
  return ctx;
}
const tenantRow = (id: string) => db.tenants.find((t) => t.id === id)!;
const inrFmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function subOf(t: Tenant): TenantSubscription {
  if (!t.subscription) t.subscription = { plan: t.plan, status: 'active', billing: 'monthly', periodEnd: new Date(Date.now() + 30 * 864e5).toISOString(), addons: [] };
  return t.subscription;
}
function addInvoice(tenantId: string, description: string, amountInr: number) {
  db.invoices.push({ id: uid('inv'), tenantId, no: `BOD-SUB-${new Date().getFullYear()}-${String(1900 + db.invoices.length).padStart(5, '0')}`, at: new Date().toISOString(), description, amountInr: Math.round(amountInr), status: 'paid' });
}

export function couponState(cp: Coupon, now = Date.now()): 'active' | 'scheduled' | 'expired' | 'used_up' | 'paused' {
  if (cp.paused) return 'paused';
  if (new Date(cp.endsAt).getTime() < now) return 'expired';
  if (new Date(cp.startsAt).getTime() > now) return 'scheduled';
  if (cp.maxUses != null && cp.used >= cp.maxUses) return 'used_up';
  return 'active';
}

export type Period = 'month' | 'last' | '90d';

export const earningsApi = {
  /** Refund requests on this workspace's DIRECT sales — the educator collected that money, so the educator decides & refunds. */
  refundRequests(userId: string) {
    const ctx = ownerOrThrow(userId);
    return db.refundRequests
      .filter((r) => r.tenantId === ctx.tenant.id && db.orders.find((o) => o.id === r.orderId)?.channel === 'tutor_direct')
      .map((r) => ({ r, o: db.orders.find((o) => o.id === r.orderId)! }))
      .sort((a, b) => (a.r.status === 'open' ? -1 : 1) - (b.r.status === 'open' ? -1 : 1) || b.r.at.localeCompare(a.r.at));
  },

  async decideRefund(userId: string, id: string, decision: 'approved' | 'rejected', note: string) {
    await wait(500);
    const ctx = ownerOrThrow(userId);
    const r = db.refundRequests.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    const o = r && db.orders.find((x) => x.id === r.orderId);
    if (!r || !o || o.channel !== 'tutor_direct') throw new ApiError('not_found', 'Refund request not found.');
    if (r.status !== 'open') throw new ApiError('state', 'Already decided.');
    if (decision === 'rejected' && note.trim().length < 5) throw new ApiError('note', 'Tell the learner why (5+ characters).', 'note');
    r.status = decision;
    if (decision === 'approved') {
      // POC: the refund itself runs through the educator's own gateway (Razorpay/Cashfree refund API).
      o.status = 'refunded';
      db.enrollments = db.enrollments.filter((e) => !(e.userId === o.userId && e.courseId === o.courseId));
      notifyUser(o.userId, 'system', `Refund approved: ₹${r.amountInr.toLocaleString('en-IN')}`, `${ctx.tenant.branding.displayName} refunded your payment. It reaches your original payment method in 5–7 working days.`, { pathname: '/payments' });
    } else notifyUser(o.userId, 'system', 'Refund request not approved', `${ctx.tenant.branding.displayName}: ${note.trim()}`);
    db.activity.push({ id: uid('act'), tenantId: ctx.tenant.id, kind: 'review', text: `Refund ${decision} · ${r.buyer} · “${r.course}”`, at: new Date().toISOString() });
    persist();
  },

  async statement(userId: string, period: Period, channel: 'all' | 'tutor_direct' | 'bodhin_marketplace') {
    await wait(250);
    const ctx = ownerOrThrow(userId);
    const now = new Date();
    const [from, to] =
      period === 'month' ? [monthStart(), Date.now()] : period === 'last' ? [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), monthStart() - 1] : [Date.now() - 90 * 864e5, Date.now()];
    const all = db.orders.filter((o) => o.sellerTenantId === ctx.tenant.id && o.status !== 'failed' && new Date(o.createdAt).getTime() >= from && new Date(o.createdAt).getTime() <= to);
    const paid = all.filter((o) => o.status === 'paid');
    const sum = (l: typeof all, f: (o: (typeof all)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
    const direct = paid.filter((o) => o.channel === 'tutor_direct');
    const market = paid.filter((o) => o.channel === 'bodhin_marketplace');
    const rows = all
      .filter((o) => channel === 'all' || o.channel === channel)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({ o, course: seedCourses.find((c) => c.id === o.courseId)! }));
    const mk = db.orders.filter((o) => o.sellerTenantId === ctx.tenant.id && o.channel === 'bodhin_marketplace' && o.status === 'paid' && o.payoutDate);
    const byDate = new Map<string, { date: string; amount: number; count: number; status: 'on_hold' | 'scheduled' | 'paid' }>();
    mk.forEach((o) => {
      const k = o.payoutDate!.slice(0, 10);
      const g = byDate.get(k) ?? { date: o.payoutDate!, amount: 0, count: 0, status: (o.payoutStatus === 'paid' ? 'paid' : o.payoutStatus === 'scheduled' ? 'scheduled' : 'on_hold') as 'on_hold' | 'scheduled' | 'paid' };
      g.amount += o.educatorShareInr;
      g.count += 1;
      byDate.set(k, g);
    });
    const payouts = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
    const history = [...(db.tenantStats[ctx.tenant.id]?.earningsHistory ?? [])];
    return {
      ctx,
      summary: {
        net: sum(direct, (o) => o.amountInr) + sum(market, (o) => o.educatorShareInr),
        direct: { gross: sum(direct, (o) => o.amountInr), count: direct.length },
        market: { gross: sum(market, (o) => o.amountInr), commission: sum(market, (o) => o.commissionInr), fees: sum(market, (o) => o.gatewayFeeInr ?? 0), net: sum(market, (o) => o.educatorShareInr), count: market.length },
        refunds: sum(all.filter((o) => o.status === 'refunded'), (o) => o.amountInr),
      },
      rows,
      upcoming: payouts.filter((p) => p.status !== 'paid').reverse(),
      paidPayouts: payouts.filter((p) => p.status === 'paid'),
      history,
      cfg: db.platformConfig,
      account: tenantRow(ctx.tenant.id).payments?.payoutAccount ?? null,
    };
  },
  statementCsv(rows: { o: Order; course: Course }[]) {
    const head = 'Date,Invoice,Buyer,Course,Channel,Collected by,Gross,Bodhin commission,Gateway fee,Your earning,Payout';
    return [head, ...rows.map(({ o, course }) => [new Date(o.createdAt).toLocaleDateString('en-IN'), o.invoiceNo, o.buyerName ?? '', `"${course.title}"`, o.channel === 'tutor_direct' ? 'Direct' : 'Marketplace', o.collector === 'bodhin' ? 'Bodhin' : 'You', o.amountInr, o.commissionInr, o.gatewayFeeInr ?? 0, o.channel === 'tutor_direct' ? o.amountInr : o.educatorShareInr, o.payoutStatus ?? ''].join(','))].join('\n');
  },
};

export const subscriptionApi = {
  overview(userId: string) {
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    const sub = subOf(t);
    const addons = ADDON_CATALOG.map((a) => ({ ...a, qty: sub.addons.filter((x) => x.kind === a.kind).reduce((s, x) => s + x.qty, 0), included: a.kind === 'custom_domain' && ctx.ent.plan.customDomain === 'included' }));
    const pp = planPriceOf(sub);
    const planPrice = sub.billing === 'annual' ? (pp.annual ?? 0) / 12 : pp.monthly ?? 0;
    const addonMonthly = addons.reduce((s, a) => s + (a.included ? 0 : a.qty * a.monthlyInr), 0);
    const usage = db.usage[t.id] ?? { activeStudents: 0, storageGb: 0, liveHours: 0, tutorSeats: 1 };
    return {
      ctx: educator.context(userId)!,
      sub,
      addons,
      monthly: { plan: Math.round(planPrice), addons: addonMonthly, total: Math.round(planPrice + addonMonthly) },
      priceLock: pp.lockedUntil ? { until: pp.lockedUntil, monthly: pp.monthly, annual: pp.annual } : null,
      invoices: db.invoices.filter((i) => i.tenantId === t.id).sort((a, b) => b.at.localeCompare(a.at)),
      plans: PLANS.map((p) => ({ p, blockers: [...planBlockers(usage, p.id, sub.addons), ...domainBlocker(t, p.id)], current: p.id === sub.plan })),
    };
  },

  async changePlan(userId: string, plan: PlanId, billing: 'monthly' | 'annual') {
    await wait(700);
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    const sub = subOf(t);
    const next = PLANS.find((p) => p.id === plan)!;
    if (next.monthlyInr == null) throw new ApiError('enterprise', 'Enterprise is a custom quote — our team will contact you.');
    const blockers = [...planBlockers(db.usage[t.id], plan, sub.addons), ...domainBlocker(t, plan)];
    if (blockers.length) throw new ApiError('blocked', `You’re using more than ${next.name} allows: ${blockers.join(', ')}. Reduce usage first — nothing is deleted automatically.`);
    const cur = PLANS.find((p) => p.id === sub.plan)!;
    const upgrade = (next.monthlyInr ?? 0) > (cur.monthlyInr ?? 0) || (plan === sub.plan && billing === 'annual' && sub.billing === 'monthly');
    if (upgrade) {
      const np = planPriceOf({ ...sub, plan }); // same plan → a running price lock still applies
      const price = (billing === 'annual' ? np.annual : np.monthly) ?? 0;
      Object.assign(sub, { plan, billing, status: 'active', pending: null, priceLock: plan === sub.plan ? sub.priceLock : null, periodEnd: new Date(Date.now() + (billing === 'annual' ? 365 : 30) * 864e5).toISOString() });
      t.plan = plan;
      addInvoice(t.id, `${next.name} plan · ${billing} (upgrade, unused time credited)`, price * 1.18);
      persist();
      return { mode: 'now' as const };
    }
    sub.pending = { plan, billing, at: sub.periodEnd };
    persist();
    return { mode: 'scheduled' as const, at: sub.periodEnd };
  },

  cancelPending(userId: string) {
    const ctx = ownerOrThrow(userId);
    subOf(tenantRow(ctx.tenant.id)).pending = null;
    persist();
  },

  async buyAddon(userId: string, kind: (typeof ADDON_CATALOG)[number]['kind'], qty: number) {
    await wait(800);
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    const sub = subOf(t);
    const a = ADDON_CATALOG.find((x) => x.kind === kind)!;
    if (kind === 'custom_domain' && ctx.ent.has('custom_domain')) throw new ApiError('included', 'Custom domain is already included in your plan.');
    if (qty < 1 || qty > 20) throw new ApiError('qty', 'Choose between 1 and 20.');
    const ex = sub.addons.find((x) => x.kind === kind);
    ex ? (ex.qty += kind === 'custom_domain' ? 0 : qty) : sub.addons.push({ kind, qty: kind === 'custom_domain' ? 1 : qty });
    addInvoice(t.id, `${a.label} add-on × ${kind === 'custom_domain' ? 1 : qty} (prorated this month)`, a.monthlyInr * (kind === 'custom_domain' ? 1 : qty) * 1.18 * 0.8);
    persist();
  },

  removeAddon(userId: string, kind: (typeof ADDON_CATALOG)[number]['kind']) {
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    const sub = subOf(t);
    const ex = sub.addons.find((x) => x.kind === kind);
    if (!ex) return;
    if (kind === 'custom_domain' && t.domain && !PLAN_FEATURES[sub.plan].includes('custom_domain')) throw new ApiError('in_use', 'Your custom domain is connected. Remove it in Workspace settings first, then remove this add-on.');
    // Removing must not push usage over the limit (100% policy: never delete user content).
    const after = { ...sub, addons: sub.addons.map((x) => (x.kind === kind ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0) };
    const lim = entitlements(after).limits;
    const u = db.usage[t.id];
    const over = (kind === 'students' && lim.activeStudents != null && u.activeStudents > lim.activeStudents) || (kind === 'storage' && lim.storageGb != null && u.storageGb > lim.storageGb) || (kind === 'seats' && lim.tutorSeats != null && u.tutorSeats > lim.tutorSeats) || (kind === 'live_hours' && lim.liveHours != null && u.liveHours > lim.liveHours);
    if (over) throw new ApiError('in_use', 'You’re using this capacity right now, so it can’t be removed yet.');
    sub.addons = after.addons;
    persist();
  },
};

/** A connected custom domain needs the feature on the new plan (or the add-on). */
function domainBlocker(t: Tenant, plan: PlanId) {
  const sub = t.subscription;
  return t.domain && !PLAN_FEATURES[plan].includes('custom_domain') && !sub?.addons.some((a) => a.kind === 'custom_domain') ? ['a connected custom domain (add the Custom domain add-on or remove the domain)'] : [];
}

export const paymentsSetup = {
  get(userId: string) {
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    t.payments ??= { directGateway: null, directGatewayStatus: 'not_connected', payoutAccount: null };
    return { ctx, p: t.payments, cfg: db.platformConfig };
  },
  async connectGateway(userId: string, provider: 'razorpay' | 'cashfree', keyId: string, secret: string) {
    await wait(1100);
    const { p } = paymentsSetup.get(userId);
    if (provider === 'razorpay' && !/^rzp_(live|test)_[A-Za-z0-9]{6,}$/.test(keyId.trim())) throw new ApiError('key', 'Razorpay Key ID looks like rzp_live_XXXXXXXX.', 'key');
    if (provider === 'cashfree' && keyId.trim().length < 8) throw new ApiError('key', 'Enter your Cashfree App ID.', 'key');
    if (secret.trim().length < 8) throw new ApiError('secret', 'Enter the key secret (8+ characters).', 'secret');
    Object.assign(p, { directGateway: provider, directGatewayStatus: 'active' });
    persist();
  },
  disconnectGateway(userId: string) {
    const { p } = paymentsSetup.get(userId);
    Object.assign(p, { directGateway: null, directGatewayStatus: 'not_connected' });
    persist();
  },
  async saveBank(userId: string, input: { holder: string; account: string; confirm: string; ifsc: string }) {
    await wait(1300);
    const { p } = paymentsSetup.get(userId);
    if (input.holder.trim().length < 3) throw new ApiError('holder', 'Enter the name exactly as on the bank account.', 'holder');
    if (!/^\d{9,18}$/.test(input.account)) throw new ApiError('account', 'Account number should be 9–18 digits.', 'account');
    if (input.account !== input.confirm) throw new ApiError('confirm', 'Account numbers don’t match.', 'confirm');
    const ifsc = input.ifsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new ApiError('ifsc', 'IFSC looks like HDFC0001234.', 'ifsc');
    const BANKS: Record<string, string> = { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', IOBA: 'Indian Overseas Bank', TMBL: 'Tamilnad Mercantile Bank', KVBL: 'Karur Vysya Bank' };
    p.payoutAccount = { bank: BANKS[ifsc.slice(0, 4)] ?? `${ifsc.slice(0, 4)} Bank`, last4: input.account.slice(-4), verified: true };
    persist();
    return p.payoutAccount;
  },
  saveTax(userId: string, gstin: string) {
    const { p } = paymentsSetup.get(userId);
    const g = gstin.trim().toUpperCase();
    if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g)) throw new ApiError('gstin', 'GSTIN should be 15 characters, e.g. 33ABCDE1234F1Z5.', 'gstin');
    p.gstin = g || undefined;
    persist();
  },
};

export const teamApi = {
  get(userId: string) {
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    const courses = seedCourses.filter((c) => c.tenantId === t.id);
    const members = db.memberships
      .filter((m) => m.tenantId === t.id && (m.role === 'owner' || m.role === 'tutor'))
      .map((m) => {
        const u = db.users.find((x) => x.id === m.userId)!;
        const assigned = m.role === 'owner' ? courses.map((c) => c.id) : db.tutorAssignments.filter((a) => a.userId === u.id).map((a) => a.courseId);
        return { u, role: m.role as 'owner' | 'tutor', assigned, batches: db.batches.filter((b) => b.tenantId === t.id && b.instructorIds.includes(u.id)).length };
      })
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.u.name.localeCompare(b.u.name)));
    const invites = db.invites.filter((i) => i.tenantId === t.id);
    const limit = ctx.ent.limits.tutorSeats;
    const used = members.length + invites.length;
    return { ctx, members, invites, courses, seats: { used, limit, members: members.length }, multiTutor: ctx.ent.has('multi_tutor') };
  },
  async invite(userId: string, input: { name: string; email: string; courseIds: string[] }) {
    await wait(500);
    const g = teamApi.get(userId);
    if (!g.multiTutor) throw new ApiError('plan', 'Adding tutors needs the Growth plan or higher.');
    if (g.seats.limit != null && g.seats.used >= g.seats.limit) throw new ApiError('seats', `All ${g.seats.limit} tutor seats are in use. Add a seat block in Subscription & usage.`);
    if (input.name.trim().length < 2) throw new ApiError('name', 'Enter the tutor’s name.', 'name');
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('email', 'Enter a valid email.', 'email');
    if (g.members.some((m) => m.u.email === email) || g.invites.some((i) => i.email === email)) throw new ApiError('email', 'This person is already on your team or invited.', 'email');
    if (!input.courseIds.length) throw new ApiError('courses', 'Assign at least one course.', 'courses');
    db.invites.push({ id: uid('iv'), tenantId: g.ctx.tenant.id, name: input.name.trim(), email, courseIds: input.courseIds, sentAt: new Date().toISOString() });
    persist();
  },
  revoke(userId: string, inviteId: string) {
    const ctx = ownerOrThrow(userId);
    db.invites = db.invites.filter((i) => !(i.id === inviteId && i.tenantId === ctx.tenant.id));
    persist();
  },
  setCourses(userId: string, tutorId: string, courseIds: string[]) {
    const ctx = ownerOrThrow(userId);
    if (!db.memberships.some((m) => m.userId === tutorId && m.tenantId === ctx.tenant.id && m.role === 'tutor')) throw new ApiError('not_found', 'This tutor isn’t on your team.');
    const mine = new Set(seedCourses.filter((c) => c.tenantId === ctx.tenant.id).map((c) => c.id));
    if (courseIds.some((id) => !mine.has(id))) throw new ApiError('courses', 'You can only assign your own workspace’s courses.');
    // Keep the tutor's assignments in other workspaces untouched.
    db.tutorAssignments = [...db.tutorAssignments.filter((a) => !(a.userId === tutorId && mine.has(a.courseId))), ...courseIds.map((courseId) => ({ userId: tutorId, courseId }))];
    persist();
  },
  remove(userId: string, tutorId: string) {
    const ctx = ownerOrThrow(userId);
    if (tutorId === userId) throw new ApiError('self', 'The owner can’t be removed.');
    if (!db.memberships.some((m) => m.userId === tutorId && m.tenantId === ctx.tenant.id && m.role === 'tutor')) throw new ApiError('not_found', 'This tutor isn’t on your team.');
    db.memberships = db.memberships.filter((m) => !(m.userId === tutorId && m.tenantId === ctx.tenant.id && m.role === 'tutor'));
    const mine = new Set(seedCourses.filter((c) => c.tenantId === ctx.tenant.id).map((c) => c.id));
    db.tutorAssignments = db.tutorAssignments.filter((a) => !(a.userId === tutorId && mine.has(a.courseId)));
    // Their batches and classes move to the owner so nothing is left without an instructor.
    db.batches.filter((b) => b.tenantId === ctx.tenant.id && b.instructorIds.includes(tutorId)).forEach((b) => {
      b.instructorIds = b.instructorIds.filter((x) => x !== tutorId);
      if (!b.instructorIds.includes(userId)) b.instructorIds.push(userId);
    });
    const u = db.usage[ctx.tenant.id];
    if (u) u.tutorSeats = Math.max(1, u.tutorSeats - 1);
    persist();
  },
};

const RESERVED = ['www', 'app', 'admin', 'api', 'mail', 'help', 'support', 'blog', 'bodhin', 'static', 'cdn'];

export const workspaceApi = {
  get(userId: string) {
    const ctx = ownerOrThrow(userId);
    const t = tenantRow(ctx.tenant.id);
    return { ctx, t, canCustom: ctx.ent.has('custom_domain'), whiteLabel: ctx.ent.has('white_label') };
  },
  saveBranding(userId: string, b: { displayName: string; tagline: string; primary: string; accent: string; hidePoweredBy?: boolean }) {
    const { t, whiteLabel } = workspaceApi.get(userId);
    if (b.displayName.trim().length < 3) throw new ApiError('name', 'Workspace name needs 3+ characters.', 'name');
    const darken = (hex: string) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0')).join('');
    t.branding = { ...t.branding, displayName: b.displayName.trim(), tagline: b.tagline.trim(), primary: b.primary, primaryDeep: darken(b.primary), accent: b.accent, hidePoweredBy: whiteLabel ? b.hidePoweredBy : false }; // white-label plans only
    persist();
  },
  checkSlug(userId: string, slug: string) {
    const { t } = workspaceApi.get(userId);
    const s = slug.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(s)) return { ok: false, msg: '3–30 characters: letters, numbers and hyphens.' };
    if (RESERVED.includes(s)) return { ok: false, msg: 'This name is reserved.' };
    if (db.tenants.some((x) => x.slug === s && x.id !== t.id)) return { ok: false, msg: 'Already taken. Try another.' };
    return { ok: true, msg: s === t.slug ? 'This is your current address.' : `${s}.thebodhin.com is available.` };
  },
  changeSlug(userId: string, slug: string) {
    const { t } = workspaceApi.get(userId);
    const r = workspaceApi.checkSlug(userId, slug);
    if (!r.ok) throw new ApiError('slug', r.msg, 'slug');
    t.slug = slug.trim().toLowerCase();
    persist();
  },
  addDomain(userId: string, host: string) {
    const { t, canCustom } = workspaceApi.get(userId);
    if (!canCustom) throw new ApiError('plan', 'Custom domain is included in Institute, or add it from Subscription & usage.');
    const h = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) throw new ApiError('host', 'Enter a domain like learn.youracademy.com', 'host');
    if (h.endsWith('thebodhin.com')) throw new ApiError('host', 'Use your own domain here. Your Bodhin address is set above.', 'host');
    if (db.tenants.some((x) => x.id !== t.id && (x.domain?.host === h || x.customDomain === h))) throw new ApiError('host', 'This domain is already connected to another workspace.', 'host');
    t.domain = { host: h, status: 'pending_dns', addedAt: new Date().toISOString() };
    t.customDomain = undefined;
    persist();
  },
  async verifyDomain(userId: string) {
    await wait(1600);
    const { t } = workspaceApi.get(userId);
    if (!t.domain) return;
    if (t.domain.host.includes('fail')) throw new ApiError('dns', 'We couldn’t find the CNAME record yet. DNS can take up to 24 hours — try again later.');
    t.domain.status = 'active';
    t.customDomain = t.domain.host;
    persist();
  },
  removeDomain(userId: string) {
    const { t } = workspaceApi.get(userId);
    t.domain = null;
    t.customDomain = undefined;
    persist();
  },
};

export const couponsApi = {
  list(userId: string) {
    const ctx = ownerOrThrow(userId);
    const rows = db.coupons.filter((c) => c.tenantId === ctx.tenant.id).map((cp) => ({ cp, state: couponState(cp) }));
    const order = { active: 0, scheduled: 1, paused: 2, used_up: 3, expired: 4 };
    rows.sort((a, b) => order[a.state] - order[b.state] || b.cp.createdAt.localeCompare(a.cp.createdAt));
    return { ctx, rows, courses: seedCourses.filter((c) => c.tenantId === ctx.tenant.id && c.priceInr > 0), enabled: ctx.ent.has('coupons') };
  },
  create(userId: string, input: { code: string; type: 'pct' | 'flat'; value: number; courseIds: string[]; maxUses: number | null; startsAt: string; endsAt: string }) {
    const { ctx, courses, enabled } = couponsApi.list(userId);
    if (!enabled) throw new ApiError('plan', 'Coupons need the Creator plan or higher.');
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,15}$/.test(code)) throw new ApiError('code', 'Code: 4–15 letters or numbers, no spaces.', 'code');
    if (db.coupons.some((c) => c.tenantId === ctx.tenant.id && c.code === code) || COUPONS[code]) throw new ApiError('code', 'This code already exists.', 'code');
    if (input.type === 'pct' && (input.value < 1 || input.value > 90)) throw new ApiError('value', 'Percentage must be 1–90%.', 'value');
    const applies = input.courseIds.length ? courses.filter((c) => input.courseIds.includes(c.id)) : courses;
    if (input.type === 'flat' && (input.value < 50 || applies.some((c) => input.value >= c.priceInr))) throw new ApiError('value', `Flat discount must be at least ₹50 and less than the cheapest course price (${inrFmt(Math.min(...applies.map((c) => c.priceInr)))}).`, 'value');
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) throw new ApiError('dates', 'End date must be after the start date.', 'dates');
    if (new Date(input.endsAt).getTime() < Date.now()) throw new ApiError('dates', 'End date is in the past.', 'dates');
    db.coupons.push({ id: uid('cp'), tenantId: ctx.tenant.id, code, type: input.type, value: input.value, courseIds: input.courseIds, maxUses: input.maxUses, used: 0, startsAt: input.startsAt, endsAt: input.endsAt, paused: false, createdAt: new Date().toISOString() });
    persist();
    return code;
  },
  togglePause(userId: string, id: string) {
    const ctx = ownerOrThrow(userId);
    const cp = db.coupons.find((c) => c.id === id && c.tenantId === ctx.tenant.id);
    if (cp) cp.paused = !cp.paused;
    persist();
  },
  endNow(userId: string, id: string) {
    const ctx = ownerOrThrow(userId);
    const cp = db.coupons.find((c) => c.id === id && c.tenantId === ctx.tenant.id);
    if (!cp) return;
    if (cp.used === 0) db.coupons = db.coupons.filter((c) => c.id !== id);
    else cp.endsAt = new Date().toISOString();
    persist();
  },
};

/* ───────────────────────── Super Admin portal (SA1) ───────────────────────── */

function adminRoleOf(userId: string): AdminRole | null {
  const m = db.memberships.find((x) => x.userId === userId && isAdminRole(x.role));
  return m ? (m.role as AdminRole) : null;
}
/** Throws unless the user is Bodhin staff with this permission (real: checked on every admin endpoint). */
export function adminGuard(userId: string, perm: AdminPerm) {
  const role = adminRoleOf(userId);
  if (!role || !ROLE_PERMS[role].includes(perm)) throw new ApiError('forbidden', 'Your admin role doesn’t allow this.');
  return { role, user: db.users.find((u) => u.id === userId)! };
}
/** Writes an audit entry. Every admin mutation must call this (real: same transaction as the change). */
export function audit(userId: string, action: string, target: AuditEntry['target'], summary: string, before?: unknown, after?: unknown) {
  const u = db.users.find((x) => x.id === userId);
  db.audit.unshift({ id: uid('au'), at: new Date().toISOString(), actorId: userId, actorName: u?.name ?? 'System', action, target, summary, before, after });
}
/** Price the tenant actually pays: a locked (old) price during the notice period, else the catalogue price. */
function planPriceOf(sub: TenantSubscription) {
  const p = PLANS.find((x) => x.id === sub.plan)!;
  const l = sub.priceLock;
  // A lock belongs to the plan it was given on, and never makes the tenant pay MORE than today's price.
  const lock = l && new Date(l.until).getTime() > Date.now() && (!l.plan || l.plan === sub.plan) ? l : null;
  const low = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
  const monthly = lock ? low(lock.monthlyInr, p.monthlyInr) : p.monthlyInr;
  const annual = lock ? low(lock.annualInr, p.annualInr) : p.annualInr;
  const locked = !!lock && (monthly !== p.monthlyInr || annual !== p.annualInr);
  return { monthly, annual, lockedUntil: locked ? lock!.until : null };
}
function monthlyPrice(t: Tenant) {
  const sub = t.subscription;
  if (!sub || sub.status === 'trialing' || sub.status === 'cancelled') return 0;
  const p = PLANS.find((x) => x.id === sub.plan)!;
  const pp = planPriceOf(sub);
  const plan = sub.billing === 'annual' ? (pp.annual ?? 0) / 12 : pp.monthly ?? 0;
  const addons = sub.addons.reduce((s, a) => {
    const cat = ADDON_CATALOG.find((x) => x.kind === a.kind);
    return s + (cat && !(a.kind === 'custom_domain' && p.customDomain === 'included') ? cat.monthlyInr * a.qty : 0);
  }, 0);
  return Math.round(plan + addons);
}
/** Payable in the run on `runDate` (any time that day, local time) — compares real instants, not UTC date strings. */
const dueBy = (payoutDate: string | undefined, runDate: string) => !!payoutDate && new Date(payoutDate).getTime() < new Date(runDate).getTime() + 864e5;
const nextPayoutDate = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() !== db.platformConfig.payoutWeekday);
  return d.toISOString();
};

export type AdminAlert = { id: string; tone: 'danger' | 'warning' | 'info'; icon: string; title: string; sub: string; tenantId?: string; href?: string };

export const admin = {
  me(userId: string) {
    const role = adminRoleOf(userId);
    if (!role) return null;
    return { role, perms: ROLE_PERMS[role], user: db.users.find((u) => u.id === userId)!, verified: !!db.adminVerified[userId] && Date.now() - new Date(db.adminVerified[userId]).getTime() < 12 * 36e5 };
  },

  /** Second factor for staff (POC: 123456; real: TOTP app or SMS OTP, session claim valid 12 h). */
  async verify(userId: string, code: string) {
    await wait(500);
    if (!adminRoleOf(userId)) throw new ApiError('forbidden', 'Not a Bodhin admin account.');
    if (code !== DEMO_OTP) throw new ApiError('bad_otp', 'That code is not correct. Try again.', 'code');
    db.adminVerified[userId] = new Date().toISOString();
    audit(userId, 'admin.sign_in', { kind: 'admin', id: userId, label: db.users.find((u) => u.id === userId)!.name }, 'Signed in with 2-step verification');
    persist();
  },
  signOut(userId: string) {
    delete db.adminVerified[userId];
    persist();
  },

  async overview(userId: string) {
    await wait(300);
    const { role } = adminGuard(userId, 'overview');
    const cfg = db.platformConfig;
    const from = monthStart();
    const paid = db.orders.filter((o) => o.status === 'paid' && new Date(o.createdAt).getTime() >= from);
    const workspaces = db.tenants.filter((t) => t.id !== cfg.bodhinTenantId);
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    // Seeded workspaces store full-month figures; take the month-to-date share so every number is "so far this month".
    const mtd = dayOfMonth / daysInMonth;
    const seeded = workspaces.map((t) => db.tenantStats[t.id]).filter((x) => x && x.monthDirect != null).map((x) => ({ ...x!, monthDirect: Math.round((x!.monthDirect ?? 0) * mtd), monthMarket: Math.round((x!.monthMarket ?? 0) * mtd), payoutDue: x!.payoutDue }));
    const sum = <T,>(l: T[], f: (x: T) => number) => l.reduce((s, x) => s + f(x), 0);
    const directLive = sum(paid.filter((o) => o.channel === 'tutor_direct'), (o) => o.amountInr);
    const marketLive = sum(paid.filter((o) => o.channel === 'bodhin_marketplace'), (o) => o.amountInr);
    const ownSales = sum(paid.filter((o) => o.channel === 'bodhin_own' || o.sellerTenantId === cfg.bodhinTenantId || (!o.channel && seedCourses.find((c) => c.id === o.courseId)?.tenantId === cfg.bodhinTenantId)), (o) => o.amountInr);
    const direct = directLive + sum(seeded, (x) => x!.monthDirect ?? 0);
    const market = marketLive + sum(seeded, (x) => x!.monthMarket ?? 0);
    const commission = sum(paid.filter((o) => o.channel === 'bodhin_marketplace'), (o) => o.commissionInr) + Math.round(sum(seeded, (x) => x!.monthMarket ?? 0) * cfg.commissionRate);
    const mrr = sum(workspaces, monthlyPrice);
    const gmv = direct + market + ownSales;
    const bodhinRevenue = mrr + commission + ownSales;
    const subsOf = (st: string) => workspaces.filter((t) => t.subscription?.status === st);
    const prev = { gmv: db.platformHistory.gmv[db.platformHistory.gmv.length - 1], bodhin: db.platformHistory.bodhin[db.platformHistory.bodhin.length - 1] };
    const pace = (v: number) => Math.round((v / Math.max(1, dayOfMonth)) * daysInMonth);

    const payoutDate = nextPayoutDate();
    const dueOrders = db.orders.filter((o) => o.channel === 'bodhin_marketplace' && o.status === 'paid' && o.payoutStatus !== 'paid' && dueBy(o.payoutDate, payoutDate));
    const payoutDue = sum(dueOrders, (o) => o.educatorShareInr) + sum(seeded, (x) => x!.payoutDue ?? 0);
    const payoutTenants = new Set([...dueOrders.map((o) => o.sellerTenantId), ...workspaces.filter((t) => (db.tenantStats[t.id]?.payoutDue ?? 0) > 0).map((t) => t.id)]).size;

    const pending = {
      educators: db.applications.filter((a) => a.status === 'submitted' || a.status === 'under_review').length,
      courses: seedCourses.filter((c) => c.moderation === 'pending' && c.visibility !== 'private').length,
      reports: db.reports.filter((r) => r.status === 'open').length,
      refunds: db.refundRequests.filter((r) => r.status === 'open').length,
      tickets: db.tickets.filter((t) => t.status !== 'resolved').length,
      payouts: { amount: payoutDue, tenants: payoutTenants, date: payoutDate },
    };

    const alerts: AdminAlert[] = [];
    workspaces.forEach((t) => {
      const name = t.branding.displayName;
      const sub = t.subscription;
      if (t.status === 'suspended') alerts.push({ id: `sus_${t.id}`, tone: 'info', icon: 'pause-circle', title: `${name} is suspended`, sub: 'Students can’t buy or join until reactivated', tenantId: t.id });
      if (sub?.status === 'past_due') alerts.push({ id: `pd_${t.id}`, tone: 'danger', icon: 'card', title: `${name}: payment failed`, sub: `${PLANS.find((p) => p.id === sub.plan)!.name} renewal overdue ${Math.max(1, -Math.ceil((new Date(sub.periodEnd).getTime() - Date.now()) / 864e5))} days`, tenantId: t.id });
      if (sub?.status === 'trialing' && daysLeft(sub.periodEnd) <= 3) alerts.push({ id: `tr_${t.id}`, tone: 'warning', icon: 'hourglass', title: `${name}: trial ends in ${daysLeft(sub.periodEnd)} day${daysLeft(sub.periodEnd) === 1 ? '' : 's'}`, sub: t.payments?.directGatewayStatus === 'active' ? 'Gateway connected — likely to convert' : 'No gateway or plan chosen yet', tenantId: t.id });
      if (sub && sub.status !== 'cancelled' && db.usage[t.id]) {
        usageReport(db.usage[t.id], sub).rows.filter((r) => (r.level === 'limit' || r.level === 'critical') && !(r.key === 'tutorSeats' && (r.limit ?? 0) <= 1)).forEach((r) => alerts.push({ id: `us_${t.id}_${r.key}`, tone: r.level === 'limit' ? 'danger' : 'warning', icon: r.icon, title: `${name}: ${r.label} at ${r.pct}%`, sub: r.level === 'limit' ? 'New ' + (r.key === 'activeStudents' ? 'enrolments' : r.key === 'storageGb' ? 'uploads' : r.key === 'liveHours' ? 'classes' : 'invites') + ' paused — suggest an add-on' : 'Above 85% — upsell opportunity', tenantId: t.id }));
      }
      if (t.status === 'active' && sub?.status === 'active' && t.payments?.directGatewayStatus !== 'active') alerts.push({ id: `gw_${t.id}`, tone: 'info', icon: 'flash-off', title: `${name}: no payment gateway`, sub: 'Direct sales are paused', tenantId: t.id });
      if (t.domain && t.domain.status !== 'active' && Date.now() - new Date(t.domain.addedAt).getTime() > 864e5) alerts.push({ id: `dn_${t.id}`, tone: 'warning', icon: 'globe', title: `${name}: domain not verified`, sub: `${t.domain.host} · DNS pending for ${Math.round((Date.now() - new Date(t.domain.addedAt).getTime()) / 864e5)} days`, tenantId: t.id });
      if ((db.tenantStats[t.id]?.monthMarket ?? 0) > 0 && !t.payments?.payoutAccount?.verified) alerts.push({ id: `bk_${t.id}`, tone: 'warning', icon: 'business', title: `${name}: no payout bank`, sub: 'Marketplace earnings can’t be released', tenantId: t.id });
    });
    const toneOrder = { danger: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);

    return {
      role,
      kpis: {
        gmv, bodhinRevenue, mrr, commission, ownSales, direct, market,
        paceGmv: pace(gmv), paceBodhin: mrr + pace(commission + ownSales), prev,
        workspaces: workspaces.filter((t) => t.status === 'active' && t.subscription?.status !== 'cancelled').length,
        trials: subsOf('trialing').length,
        pastDue: subsOf('past_due').length,
        newThisMonth: workspaces.filter((t) => t.createdAt && new Date(t.createdAt).getTime() >= from).length,
        students: sum(Object.values(db.usage), (u) => u.activeStudents),
      },
      pending,
      alerts,
      activity: db.audit.slice(0, 6),
      history: { gmv: [...db.platformHistory.gmv, pace(gmv)], bodhin: [...db.platformHistory.bodhin, mrr + pace(commission + ownSales)] },
      cfg,
    };
  },

  /** One box for everything: workspaces, people, courses, orders/invoices, applications. */
  search(userId: string, q: string) {
    adminGuard(userId, 'overview');
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const has = (...v: (string | undefined)[]) => v.some((x) => x?.toLowerCase().includes(s));
    type Hit = { kind: 'tenant' | 'user' | 'course' | 'order' | 'application'; id: string; title: string; sub: string; badge?: string };
    const out: Hit[] = [];
    db.tenants.filter((t) => has(t.branding.displayName, t.slug, t.customDomain, db.users.find((u) => u.id === t.ownerUserId)?.name)).slice(0, 5).forEach((t) => out.push({ kind: 'tenant', id: t.id, title: t.branding.displayName, sub: `${t.customDomain ?? `${t.slug}.thebodhin.com`} · ${PLANS.find((p) => p.id === (t.subscription?.plan ?? t.plan))!.name}`, badge: t.status === 'suspended' ? 'Suspended' : t.subscription?.status === 'trialing' ? 'Trial' : t.subscription?.status === 'past_due' ? 'Past due' : undefined }));
    db.users.filter((u) => has(u.name, u.email, u.phone)).slice(0, 5).forEach((u) => {
      const roles = [...new Set(db.memberships.filter((m) => m.userId === u.id).map((m) => m.role))];
      out.push({ kind: 'user', id: u.id, title: u.name, sub: `${u.email} · ${u.phone}`, badge: roles.find((r) => r !== 'student') ?? 'student' });
    });
    seedCourses.filter((c) => has(c.title, c.id)).slice(0, 5).forEach((c) => out.push({ kind: 'course', id: c.id, title: c.title, sub: `${db.tenants.find((t) => t.id === c.tenantId)?.branding.displayName ?? ''} · ₹${c.priceInr.toLocaleString('en-IN')}`, badge: c.moderation === 'pending' ? 'In review' : c.visibility === 'private' ? 'Private' : undefined }));
    db.orders.filter((o) => has(o.invoiceNo, o.id, o.buyerName)).slice(0, 5).forEach((o) => out.push({ kind: 'order', id: o.id, title: `${o.invoiceNo} · ₹${o.amountInr.toLocaleString('en-IN')}`, sub: `${o.buyerName ?? ''} · ${seedCourses.find((c) => c.id === o.courseId)?.title ?? ''}`, badge: o.status === 'refunded' ? 'Refunded' : o.channel === 'tutor_direct' ? 'Direct' : 'Bodhin' }));
    db.applications.filter((a) => has(a.workspaceName, db.users.find((u) => u.id === a.userId)?.name)).slice(0, 5).forEach((a) => out.push({ kind: 'application', id: a.id, title: a.workspaceName ?? 'Application', sub: `${db.users.find((u) => u.id === a.userId)?.name ?? ''} · ${a.subjects?.join(', ') ?? ''}`, badge: a.status.replace('_', ' ') }));
    return out;
  },

  /** Quick-look facts for a search hit (one tap, no navigation). */
  peek(userId: string, kind: string, id: string) {
    adminGuard(userId, 'overview');
    const rows: [string, string][] = [];
    if (kind === 'tenant') {
      const t = db.tenants.find((x) => x.id === id)!;
      const sub = t.subscription;
      const owner = db.users.find((u) => u.id === t.ownerUserId);
      rows.push(['Owner', owner ? `${owner.name} · ${owner.email}` : '—'], ['Plan', sub ? `${PLANS.find((p) => p.id === sub.plan)!.name} · ${sub.billing} · ${sub.status}` : '—'], ['Renews / ends', sub ? new Date(sub.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'], ['MRR', `₹${monthlyPrice(t).toLocaleString('en-IN')}`]);
      const u = db.usage[t.id];
      if (u && sub) usageReport(u, sub).rows.forEach((r) => rows.push([r.label, `${r.used}${r.unit ? ` ${r.unit}` : ''} / ${r.limit ?? '∞'} (${r.pct}%)`]));
      rows.push(['Gateway', t.payments?.directGatewayStatus === 'active' ? `${t.payments.directGateway} · live` : 'Not connected'], ['Payout bank', t.payments?.payoutAccount ? `${t.payments.payoutAccount.bank} ••${t.payments.payoutAccount.last4}` : 'Missing']);
    } else if (kind === 'user') {
      const u = db.users.find((x) => x.id === id)!;
      rows.push(['Email', u.email], ['Phone', `${u.phone}${u.phoneVerified ? ' ✓' : ''}`], ['Joined', new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })]);
      db.memberships.filter((m) => m.userId === id).forEach((m) => rows.push([db.tenants.find((t) => t.id === m.tenantId)?.branding.displayName ?? m.tenantId, m.role]));
      rows.push(['Enrolments', String(db.enrollments.filter((e) => e.userId === id).length)], ['Orders', String(db.orders.filter((o) => o.userId === id).length)]);
    } else if (kind === 'course') {
      const c = seedCourses.find((x) => x.id === id)!;
      rows.push(['Workspace', db.tenants.find((t) => t.id === c.tenantId)?.branding.displayName ?? ''], ['Price', `₹${c.priceInr.toLocaleString('en-IN')}${c.compareAtInr ? ` (was ₹${c.compareAtInr.toLocaleString('en-IN')})` : ''}`], ['Visibility', c.visibility], ['Review', c.moderation], ['Status', c.status ?? 'published'], ['Students', String(c.students)], ['Rating', c.ratingCount ? `${c.rating} (${c.ratingCount})` : '—']);
    } else if (kind === 'order') {
      const o = db.orders.find((x) => x.id === id)!;
      rows.push(['Buyer', o.buyerName ?? db.users.find((u) => u.id === o.userId)?.name ?? ''], ['Course', seedCourses.find((c) => c.id === o.courseId)?.title ?? ''], ['Amount', `₹${o.amountInr.toLocaleString('en-IN')}${o.coupon ? ` · coupon ${o.coupon}` : ''}`], ['Channel', o.channel ?? '—'], ['Collected by', o.collector ?? 'bodhin'], ['Commission', `₹${o.commissionInr.toLocaleString('en-IN')}`], ['Educator share', `₹${o.educatorShareInr.toLocaleString('en-IN')}`], ['Payout', o.payoutStatus ?? '—'], ['Date', new Date(o.createdAt).toLocaleString('en-IN')]);
    } else if (kind === 'application') {
      const a = db.applications.find((x) => x.id === id)!;
      const u = db.users.find((x) => x.id === a.userId);
      rows.push(['Applicant', u ? `${u.name} · ${u.email}` : ''], ['Subjects', a.subjects?.join(', ') ?? ''], ['Experience', `${a.experienceYears ?? 0} years`], ['City', a.city ?? ''], ['Planned students', String(a.plannedStudents ?? '')], ['ID verified', a.idVerified ? 'Yes' : 'No'], ['Status', a.status.replace('_', ' ')], ['Submitted', a.submittedAt ? new Date(a.submittedAt).toLocaleString('en-IN') : '']);
    }
    return rows;
  },
};

/* ───────────────────────── Approvals inbox (SA2) ───────────────────────── */

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'academy';
function freeSlug(base: string) {
  let s = slugify(base);
  let n = 2;
  while (db.tenants.some((t) => t.slug === s) || RESERVED.includes(s)) s = `${slugify(base).slice(0, 21)}${n++}`;
  return s;
}
function notifyUser(userId: string, kind: 'system' | 'course', title: string, body: string, link?: { pathname: string; params?: Record<string, string> }) {
  db.notifications.push({ id: uid('n'), userId, kind, title, body, at: new Date().toISOString(), read: false, link });
}

export type InboxTab = 'educators' | 'courses' | 'reports';

export const approvals = {
  async inbox(userId: string) {
    await wait(220);
    const { role } = adminGuard(userId, 'overview');
    const perms = ROLE_PERMS[role];
    const educators = perms.includes('approvals.educators')
      ? db.applications.filter((a) => ['submitted', 'under_review', 'changes_requested'].includes(a.status)).sort((a, b) => (a.status === 'changes_requested' ? 1 : 0) - (b.status === 'changes_requested' ? 1 : 0) || (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')).map((a) => {
          const u = db.users.find((x) => x.id === a.userId)!;
          return { a, u, ready: approvals.appChecks(a).every((x) => x.ok || x.soft) };
        })
      : [];
    const courses = perms.includes('approvals.courses')
      ? seedCourses.filter((c) => c.moderation === 'pending' && c.visibility !== 'private').sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')).map((c) => {
          const t = db.tenants.find((x) => x.id === c.tenantId)!;
          return { c, t, ready: approvals.courseChecks(c).every((x) => x.ok || x.soft) };
        })
      : [];
    const reports = perms.includes('approvals.reports') ? db.reports.filter((r) => r.status === 'open').sort((a, b) => a.at.localeCompare(b.at)) : [];
    const history = db.audit.filter((e) => /^(application|course|report)\./.test(e.action)).slice(0, 12);
    return { educators, courses, reports, history, can: { educators: perms.includes('approvals.educators'), courses: perms.includes('approvals.courses'), reports: perms.includes('approvals.reports') } };
  },

  /** Automatic checks shown to the reviewer. `soft` = advisory, doesn’t block approval. */
  appChecks(a: EducatorApplication) {
    const u = db.users.find((x) => x.id === a.userId);
    const dupOwner = db.tenants.some((t) => t.ownerUserId === a.userId);
    return [
      { label: 'Mobile number verified (OTP)', ok: !!u?.phoneVerified, soft: false },
      { label: 'Government ID verified', ok: !!a.idVerified, soft: false },
      { label: 'Teaching sample shared', ok: !!a.sampleUrl, soft: true },
      { label: 'Subjects & experience filled', ok: !!a.subjects?.length && (a.experienceYears ?? 0) > 0, soft: false },
      { label: 'Not already running a workspace', ok: !dupOwner, soft: false },
    ];
  },

  appDetail(userId: string, id: string) {
    adminGuard(userId, 'approvals.educators');
    const a = db.applications.find((x) => x.id === id);
    if (!a) return null;
    const u = db.users.find((x) => x.id === a.userId)!;
    return { a, u, checks: approvals.appChecks(a), slug: freeSlug(a.workspaceName ?? u.name), trial: { days: db.platformConfig.trialDays, plan: PLANS.find((p) => p.id === db.platformConfig.trialPlan)! }, log: db.audit.filter((e) => e.target.id === id) };
  },

  startReview(userId: string, id: string) {
    const { user } = adminGuard(userId, 'approvals.educators');
    const a = db.applications.find((x) => x.id === id);
    if (a && a.status === 'submitted') {
      a.status = 'under_review';
      a.reviewedBy = user.name;
      persist();
    }
  },

  /** Approve → workspace + owner membership + trial on the configured plan. */
  async approveEducator(userId: string, id: string, slugIn?: string) {
    await wait(500);
    adminGuard(userId, 'approvals.educators');
    const a = db.applications.find((x) => x.id === id);
    if (!a || a.status === 'approved') throw new ApiError('state', 'This application is already decided.');
    const hard = approvals.appChecks(a).filter((x) => !x.ok && !x.soft);
    if (hard.length) throw new ApiError('checks', `Can’t approve yet: ${hard.map((h) => h.label.toLowerCase()).join(', ')}.`);
    const u = db.users.find((x) => x.id === a.userId)!;
    const slug = (slugIn ?? freeSlug(a.workspaceName ?? u.name)).trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) throw new ApiError('slug', '3–30 letters, numbers or hyphens.', 'slug');
    if (RESERVED.includes(slug) || db.tenants.some((t) => t.slug === slug)) throw new ApiError('slug', `${slug}.thebodhin.com is taken.`, 'slug');
    const cfg = db.platformConfig;
    const tid = `t_${slug.replace(/-/g, '')}`;
    db.tenants.push({
      id: tid, slug, status: 'active', plan: cfg.trialPlan, ownerUserId: u.id, createdAt: new Date().toISOString(),
      branding: { displayName: a.workspaceName ?? `${u.name} Academy`, primary: '#0B3B73', primaryDeep: '#071F44', accent: '#D99A1E' },
      subscription: { plan: cfg.trialPlan, status: 'trialing', billing: 'monthly', periodEnd: new Date(Date.now() + cfg.trialDays * 864e5).toISOString(), addons: [] },
      payments: { directGateway: null, directGatewayStatus: 'not_connected', payoutAccount: null },
      domain: null,
    });
    db.memberships.push({ userId: u.id, tenantId: tid, role: 'owner' });
    db.usage[tid] = { activeStudents: 0, storageGb: 0, liveHours: 0, tutorSeats: 1 };
    db.tenantStats[tid] = { students: 0, studentsDelta: 0, completion: { completed: 0, inProgress: 0, notStarted: 0 }, earningsHistory: [0, 0, 0, 0, 0, 0, 0] };
    Object.assign(a, { status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: db.users.find((x) => x.id === userId)!.name, note: undefined });
    ensureTutorProfile(tid, u.id); // the new academy's own instructor card for course pages
    notifyUser(u.id, 'system', 'Your educator workspace is ready 🎉', `${slug}.thebodhin.com is live with a ${cfg.trialDays}-day free ${PLANS.find((p) => p.id === cfg.trialPlan)!.name} trial. Sign in again to open your dashboard.`);
    audit(userId, 'application.approve', { kind: 'application', id, label: a.workspaceName ?? u.name }, `Approved · created ${slug}.thebodhin.com with ${cfg.trialDays}-day trial`);
    persist();
    return { slug, tenantId: tid };
  },

  async decideEducator(userId: string, id: string, decision: 'rejected' | 'changes_requested', note: string) {
    await wait(400);
    adminGuard(userId, 'approvals.educators');
    if (note.trim().length < 10) throw new ApiError('note', 'Write a short reason the applicant can act on (10+ characters).', 'note');
    const a = db.applications.find((x) => x.id === id);
    if (!a || a.status === 'approved') throw new ApiError('state', 'This application is already decided.');
    Object.assign(a, { status: decision, note: note.trim(), reviewedAt: new Date().toISOString(), reviewedBy: db.users.find((x) => x.id === userId)!.name });
    notifyUser(a.userId, 'system', decision === 'rejected' ? 'Educator application not approved' : 'Please update your educator application', note.trim());
    audit(userId, decision === 'rejected' ? 'application.reject' : 'application.request_changes', { kind: 'application', id, label: a.workspaceName ?? '' }, decision === 'rejected' ? `Rejected: ${note.trim()}` : `Asked for changes: ${note.trim()}`);
    persist();
  },

  courseChecks(c: Course) {
    const lessons = allLessons(c);
    const t = db.tenants.find((x) => x.id === c.tenantId);
    const reports = db.reports.filter((r) => r.targetId === c.id && r.status === 'open').length;
    return [
      { label: 'Clear title & description (50+ chars)', ok: c.title.trim().length >= 5 && c.description.trim().length >= 50, soft: false },
      { label: '3+ learning outcomes', ok: c.outcomes.filter((o) => o.trim()).length >= 3, soft: false },
      { label: `Content: ${c.modules.length} modules · ${lessons.length} lessons`, ok: lessons.length >= 3, soft: false },
      { label: 'Free preview lesson', ok: lessons.some((l) => l.preview), soft: true },
      { label: c.compareAtInr ? 'Offer price has a real end date' : 'No strike-through price', ok: !c.compareAtInr || (!!c.offerEndsAt && new Date(c.offerEndsAt).getTime() > Date.now()), soft: false },
      { label: 'Payout bank verified (marketplace earnings)', ok: !!t?.payments?.payoutAccount?.verified, soft: false },
      { label: reports ? `${reports} open report${reports > 1 ? 's' : ''} on this course` : 'No open reports', ok: reports === 0, soft: true },
    ];
  },

  courseDetail(userId: string, id: string) {
    adminGuard(userId, 'approvals.courses');
    const c = seedCourses.find((x) => x.id === id);
    if (!c) return null;
    const t = db.tenants.find((x) => x.id === c.tenantId)!;
    const owner = db.users.find((u) => u.id === t.ownerUserId);
    const others = seedCourses.filter((x) => x.tenantId === t.id && x.id !== c.id && x.moderation === 'approved' && x.visibility !== 'private').length;
    return { c, t, owner, checks: courseChecks(c), others, rate: db.platformConfig.commissionRate, reports: db.reports.filter((r) => r.targetId === c.id), log: db.audit.filter((e) => e.target.id === id) };
  },

  async decideCourse(userId: string, id: string, decision: 'approve' | 'reject', opts: { note?: string; promote?: boolean } = {}) {
    await wait(450);
    adminGuard(userId, 'approvals.courses');
    const c = seedCourses.find((x) => x.id === id);
    if (!c || c.moderation !== 'pending') throw new ApiError('state', 'This course isn’t waiting for review.');
    if (decision === 'approve') {
      const hard = courseChecks(c).filter((x) => !x.ok && !x.soft);
      if (hard.length) throw new ApiError('checks', `Can’t list yet: ${hard.map((h) => h.label.toLowerCase()).join(', ')}. Ask for changes instead.`);
    } else if ((opts.note ?? '').trim().length < 10) throw new ApiError('note', 'Tell the educator what to fix (10+ characters).', 'note');
    const visibility = decision === 'approve' && c.visibility === 'public_promoted' && opts.promote === false ? 'public' : c.visibility;
    saveCourse({ ...clone(c), visibility, moderation: decision === 'approve' ? 'approved' : 'rejected', moderationNote: decision === 'reject' ? opts.note!.trim() : undefined });
    const t = db.tenants.find((x) => x.id === c.tenantId);
    if (t?.ownerUserId) notifyUser(t.ownerUserId, 'course', decision === 'approve' ? `“${c.title}” is live on the Bodhin marketplace` : `Changes needed for “${c.title}”`, decision === 'approve' ? (visibility === 'public_promoted' ? 'Approved with promotion — Bodhin may feature it in campaigns.' : 'Approved. Learners can now find it on thebodhin.com.') : opts.note!.trim(), { pathname: '/edu/course/[id]', params: { id } });
    db.activity.push({ id: uid('act'), tenantId: c.tenantId, kind: 'review', text: decision === 'approve' ? `Bodhin approved “${c.title}” for the marketplace` : `Bodhin asked for changes on “${c.title}”`, at: new Date().toISOString(), link: { pathname: '/edu/course/[id]', params: { id } } });
    audit(userId, decision === 'approve' ? 'course.approve' : 'course.reject', { kind: 'course', id, label: c.title }, decision === 'approve' ? `Approved marketplace listing${visibility === 'public_promoted' ? ' with promotion' : ''}` : `Asked for changes: ${opts.note!.trim()}`);
    persist();
  },

  async resolveReport(userId: string, id: string, action: 'dismiss' | 'remove' | 'warn' | 'suspend', note: string) {
    await wait(350);
    adminGuard(userId, 'approvals.reports');
    const r = db.reports.find((x) => x.id === id);
    if (!r || r.status !== 'open') throw new ApiError('state', 'Already resolved.');
    const text = { dismiss: 'Dismissed — no violation', remove: r.kind === 'review' ? 'Review removed' : r.kind === 'course' ? 'Course unlisted from marketplace' : 'Content removed', warn: 'Warning sent', suspend: 'Account suspended' }[action];
    if (action === 'remove' && r.kind === 'course') {
      const c = seedCourses.find((x) => x.id === r.targetId);
      if (c) saveCourse({ ...clone(c), moderation: 'rejected', moderationNote: `Unlisted after a report: ${note || r.reason}` });
    }
    if ((action === 'warn' || action === 'suspend') && r.kind === 'user') notifyUser(r.targetId, 'system', action === 'warn' ? 'Community guidelines warning' : 'Your account is suspended', note || r.reason);
    Object.assign(r, { status: 'resolved', resolution: `${text}${note ? ` · ${note}` : ''}` });
    audit(userId, `report.${action}`, { kind: 'report', id, label: r.label }, `${text}${note ? ` — ${note}` : ''}`);
    persist();
  },

  /** Bulk approve only items that pass every hard check (others are skipped and reported back). */
  async bulkApprove(userId: string, tab: 'educators' | 'courses', ids: string[]) {
    const done: string[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      try {
        if (tab === 'educators') await approvals.approveEducator(userId, id);
        else await approvals.decideCourse(userId, id, 'approve');
        done.push(id);
      } catch {
        skipped.push(id);
      }
    }
    return { done, skipped };
  },
};
const courseChecks = (c: Course) => approvals.courseChecks(c);

/* ───────────────────────── Tenants & Workspace 360 (SA3) ───────────────────────── */

export const FEATURE_LABEL: Record<string, string> = {
  courses: 'Courses', recorded_video: 'Recorded video', live_classes: 'Live classes', assessments: 'Quizzes & assignments', certificates: 'Certificates',
  batches: 'Batches', multi_tutor: 'Multiple tutors', marketplace: 'Marketplace listing', coupons: 'Coupons', advanced_reports: 'Advanced reports', custom_domain: 'Custom domain', white_label: 'White-label',
};
export type TenantFilter = 'all' | 'trial' | 'past_due' | 'alerts' | 'suspended' | 'no_gateway';

function tenantRowOf(t: Tenant) {
  const sub = t.subscription;
  const usage = db.usage[t.id];
  const rep = sub && usage ? usageReport(usage, sub) : null;
  const worst = rep ? [...rep.rows].filter((r) => !(r.key === 'tutorSeats' && (r.limit ?? 0) <= 1)).sort((a, b) => b.pct - a.pct)[0] : null;
  const st = db.tenantStats[t.id];
  const from = monthStart();
  const live = db.orders.filter((o) => o.sellerTenantId === t.id && o.status === 'paid' && new Date(o.createdAt).getTime() >= from);
  const mtd = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const gmv = live.reduce((s, o) => s + o.amountInr, 0) + Math.round(((st?.monthDirect ?? 0) + (st?.monthMarket ?? 0)) * mtd);
  return {
    t, owner: db.users.find((u) => u.id === t.ownerUserId) ?? null, sub, mrr: monthlyPrice(t), gmv, students: usage?.activeStudents ?? 0, worst,
    flags: {
      trial: sub?.status === 'trialing', trialDays: sub?.status === 'trialing' ? daysLeft(sub.periodEnd) : null,
      pastDue: sub?.status === 'past_due', suspended: t.status === 'suspended', cancelled: sub?.status === 'cancelled',
      alert: !!worst && (worst.level === 'critical' || worst.level === 'limit'), noGateway: t.payments?.directGatewayStatus !== 'active', noBank: !t.payments?.payoutAccount?.verified,
      domainPending: !!t.domain && t.domain.status !== 'active',
    },
  };
}

export const tenantsAdmin = {
  async list(userId: string, filter: TenantFilter, q: string, sort: 'newest' | 'mrr' | 'students' | 'usage') {
    await wait(200);
    adminGuard(userId, 'tenants.view');
    const all = db.tenants.filter((t) => t.id !== db.platformConfig.bodhinTenantId).map(tenantRowOf);
    const match = (f: TenantFilter, r: ReturnType<typeof tenantRowOf>) => f === 'all' || (f === 'trial' && r.flags.trial) || (f === 'past_due' && r.flags.pastDue) || (f === 'alerts' && r.flags.alert) || (f === 'suspended' && (r.flags.suspended || r.flags.cancelled)) || (f === 'no_gateway' && r.flags.noGateway && !r.flags.cancelled);
    const s = q.trim().toLowerCase();
    const rows = all
      .filter((r) => match(filter, r))
      .filter((r) => !s || [r.t.branding.displayName, r.t.slug, r.t.customDomain, r.owner?.name, r.owner?.email, r.sub?.plan].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => (sort === 'mrr' ? b.mrr - a.mrr : sort === 'students' ? b.students - a.students : sort === 'usage' ? (b.worst?.pct ?? 0) - (a.worst?.pct ?? 0) : (b.t.createdAt ?? '').localeCompare(a.t.createdAt ?? '')));
    const counts = Object.fromEntries((['all', 'trial', 'past_due', 'alerts', 'suspended', 'no_gateway'] as TenantFilter[]).map((f) => [f, all.filter((r) => match(f, r)).length])) as Record<TenantFilter, number>;
    return { rows, counts, totals: { mrr: all.reduce((x, r) => x + r.mrr, 0), students: all.reduce((x, r) => x + r.students, 0) } };
  },

  detail(userId: string, id: string) {
    const { role } = adminGuard(userId, 'tenants.view');
    const t = db.tenants.find((x) => x.id === id);
    if (!t) return null;
    const row = tenantRowOf(t);
    const sub = t.subscription!;
    const ent = entitlements(sub);
    const report = db.usage[t.id] ? usageReport(db.usage[t.id], sub) : null;
    const courses = seedCourses.filter((c) => c.tenantId === t.id);
    const team = db.memberships.filter((m) => m.tenantId === t.id && (m.role === 'owner' || m.role === 'tutor')).map((m) => ({ role: m.role, u: db.users.find((u) => u.id === m.userId)! }));
    const orders = db.orders.filter((o) => o.sellerTenantId === t.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((o) => ({ o, course: seedCourses.find((c) => c.id === o.courseId) }));
    const st = db.tenantStats[t.id];
    return {
      ...row, ent, report, courses, courseCount: Math.max(courses.length, st?.courseCount ?? 0), team, orders,
      invoices: db.invoices.filter((i) => i.tenantId === t.id).sort((a, b) => b.at.localeCompare(a.at)),
      notes: db.tenantNotes.filter((n) => n.tenantId === t.id).sort((a, b) => b.at.localeCompare(a.at)),
      log: db.audit.filter((e) => e.target.id === t.id),
      history: st?.earningsHistory ?? [],
      month: { direct: st?.monthDirect ?? 0, market: st?.monthMarket ?? 0 },
      features: (Object.keys(FEATURE_LABEL) as (keyof typeof FEATURE_LABEL)[]).map((f) => ({ key: f, label: FEATURE_LABEL[f], plan: PLAN_FEATURES[sub.plan].includes(f as never), on: ent.has(f as never), override: sub.overrides?.features?.[f as never] })),
      canManage: ROLE_PERMS[role].includes('tenants.manage'),
    };
  },

  /** Read-only owner dashboard snapshot (audited). */
  async ownerView(userId: string, id: string) {
    adminGuard(userId, 'tenants.manage');
    const t = db.tenants.find((x) => x.id === id)!;
    if (!t.ownerUserId) throw new ApiError('no_owner', 'No owner account.');
    audit(userId, 'tenant.view_as_owner', { kind: 'tenant', id, label: t.branding.displayName }, 'Viewed the owner dashboard (read-only)');
    persist();
    return educator.dashboard(t.ownerUserId);
  },

  async act(userId: string, id: string, action:
    | { kind: 'plan'; plan: PlanId; billing: 'monthly' | 'annual'; when: 'now' | 'renewal'; reason: string }
    | { kind: 'extend_trial'; days: number; reason: string }
    | { kind: 'status'; status: 'active' | 'suspended'; reason: string }
    | { kind: 'addon'; addon: (typeof ADDON_CATALOG)[number]['kind']; qty: number; free: boolean; reason: string }
    | { kind: 'remove_addon'; addon: (typeof ADDON_CATALOG)[number]['kind']; reason: string }
    | { kind: 'overrides'; features: Record<string, boolean | undefined>; limits: Partial<Record<'activeStudents' | 'storageGb' | 'liveHours' | 'tutorSeats', number | null>>; reason: string }
    | { kind: 'mark_paid'; reason: string }
    | { kind: 'message'; title: string; body: string }
    | { kind: 'note'; text: string },
  ) {
    await wait(400);
    const { user } = adminGuard(userId, action.kind === 'note' ? 'tenants.view' : 'tenants.manage');
    const t = db.tenants.find((x) => x.id === id);
    if (!t) throw new ApiError('not_found', 'Workspace not found.');
    const sub = subOf(t);
    const label = t.branding.displayName;
    const target = { kind: 'tenant' as const, id, label };
    const needReason = (r: string) => {
      if (r.trim().length < 5) throw new ApiError('reason', 'Add a short reason — it goes into the audit log.', 'reason');
    };
    const before = JSON.parse(JSON.stringify(sub));
    switch (action.kind) {
      case 'plan': {
        needReason(action.reason);
        const p = PLANS.find((x) => x.id === action.plan)!;
        if (action.when === 'now') {
          Object.assign(sub, { plan: action.plan, billing: action.billing, status: sub.status === 'trialing' ? 'trialing' : 'active', pending: null, priceLock: action.plan === sub.plan ? sub.priceLock : null });
          t.plan = action.plan;
        } else sub.pending = { plan: action.plan, billing: action.billing, at: sub.periodEnd };
        audit(userId, 'tenant.change_plan', target, `${action.when === 'now' ? 'Changed' : 'Scheduled'} plan → ${p.name} (${action.billing}) · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', `Your plan ${action.when === 'now' ? 'is now' : 'will change to'} ${p.name}`, action.when === 'now' ? 'New limits apply immediately.' : `From ${new Date(sub.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`);
        break;
      }
      case 'extend_trial': {
        needReason(action.reason);
        if (sub.status !== 'trialing') throw new ApiError('state', 'This workspace isn’t on a trial.');
        sub.periodEnd = new Date(Math.max(Date.now(), new Date(sub.periodEnd).getTime()) + action.days * 864e5).toISOString();
        audit(userId, 'tenant.extend_trial', target, `Extended trial by ${action.days} days · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', `Your trial is extended by ${action.days} days`, `Now ends ${new Date(sub.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`);
        break;
      }
      case 'status': {
        needReason(action.reason);
        t.status = action.status;
        audit(userId, action.status === 'suspended' ? 'tenant.suspend' : 'tenant.reactivate', target, `${action.status === 'suspended' ? 'Suspended' : 'Reactivated'} · ${action.reason}`);
        if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', action.status === 'suspended' ? 'Your workspace is suspended' : 'Your workspace is active again', action.status === 'suspended' ? `${action.reason}. Students keep access to purchased courses; new sales are paused. Contact support@thebodhin.com.` : 'New enrolments and sales are open again.');
        break;
      }
      case 'addon': {
        needReason(action.reason);
        const ex = sub.addons.find((x) => x.kind === action.addon);
        ex ? (ex.qty += action.addon === 'custom_domain' ? 0 : action.qty) : sub.addons.push({ kind: action.addon, qty: action.addon === 'custom_domain' ? 1 : action.qty });
        const a = ADDON_CATALOG.find((x) => x.kind === action.addon)!;
        if (!action.free) addInvoice(t.id, `${a.label} add-on × ${action.qty} (added by Bodhin)`, a.monthlyInr * action.qty * 1.18);
        audit(userId, 'tenant.add_addon', target, `${action.free ? 'Complimentary ' : ''}${a.label} × ${action.qty} · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        break;
      }
      case 'remove_addon': {
        needReason(action.reason);
        sub.addons = sub.addons.filter((x) => x.kind !== action.addon);
        audit(userId, 'tenant.remove_addon', target, `Removed ${action.addon} add-on · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        break;
      }
      case 'overrides': {
        needReason(action.reason);
        const features = Object.fromEntries(Object.entries(action.features).filter(([, v]) => v !== undefined)) as Record<string, boolean>;
        const limits = Object.fromEntries(Object.entries(action.limits).filter(([, v]) => v !== undefined));
        sub.overrides = Object.keys(features).length || Object.keys(limits).length ? { features: features as never, limits: limits as never } : undefined;
        audit(userId, 'tenant.overrides', target, `Updated overrides (${Object.keys(features).length} features, ${Object.keys(limits).length} limits) · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        break;
      }
      case 'mark_paid': {
        needReason(action.reason);
        if (sub.status !== 'past_due') throw new ApiError('state', 'No overdue payment.');
        const p = PLANS.find((x) => x.id === sub.plan)!;
        const pp = planPriceOf(sub); // honour a running price lock
        Object.assign(sub, { status: 'active', periodEnd: new Date(Date.now() + (sub.billing === 'annual' ? 365 : 30) * 864e5).toISOString() });
        addInvoice(t.id, `${p.name} plan · ${sub.billing} (payment recorded by Bodhin)`, ((sub.billing === 'annual' ? pp.annual : pp.monthly) ?? 0) * 1.18);
        audit(userId, 'tenant.mark_paid', target, `Recorded payment, renewed ${sub.billing} · ${action.reason}`, before, JSON.parse(JSON.stringify(sub)));
        break;
      }
      case 'message': {
        if (action.title.trim().length < 3 || action.body.trim().length < 5) throw new ApiError('reason', 'Write a title and a message.', 'reason');
        if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', action.title.trim(), action.body.trim());
        audit(userId, 'tenant.message', target, `Messaged owner: ${action.title.trim()}`);
        break;
      }
      case 'note': {
        if (action.text.trim().length < 3) throw new ApiError('reason', 'Write a note.', 'reason');
        db.tenantNotes.push({ id: uid('tn'), tenantId: id, text: action.text.trim(), by: user.name, at: new Date().toISOString() });
        break;
      }
    }
    persist();
  },
};

/* ───────────────────────── Plans & platform settings (SA4) ───────────────────────── */

const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Cfg = typeof db.platformConfig;
const CFG_FMT: Record<keyof Omit<Cfg, 'bodhinTenantId'>, [string, (v: never) => string]> = {
  commissionRate: ['Marketplace commission', (v: number) => `${Math.round(v * 1000) / 10}%`],
  gatewayFeeRate: ['Gateway fee (passed to educator)', (v: number) => `${Math.round(v * 1000) / 10}%`],
  refundHoldDays: ['Refund hold before payout', (v: number) => `${v} days`],
  payoutWeekday: ['Payout day', (v: number) => DAY_NAME[v]],
  attributionDays: ['Referral attribution window', (v: number) => `${v} days`],
  trialDays: ['Free trial length', (v: number) => `${v} days`],
  trialPlan: ['Trial plan', (v: string) => PLANS.find((p) => p.id === v)?.name ?? v],
};
const NOTICE_DAYS = 30;

export const settingsAdmin = {
  platform(userId: string) {
    const { role } = adminGuard(userId, 'overview');
    return { cfg: { ...db.platformConfig }, canEdit: ROLE_PERMS[role].includes('config.edit'), history: db.configHistory.filter((h) => h.area === 'platform') };
  },

  /** What a config change would do, using the last 30 days of marketplace sales. */
  platformImpact(next: Cfg) {
    const cur = db.platformConfig;
    const since = Date.now() - 30 * 864e5;
    const mk = db.orders.filter((o) => o.channel === 'bodhin_marketplace' && o.status === 'paid' && new Date(o.createdAt).getTime() >= since);
    const seeded = db.tenants.reduce((s, t) => s + (db.tenantStats[t.id]?.monthMarket ?? 0), 0);
    const gross = mk.reduce((s, o) => s + o.amountInr, 0) + seeded;
    const sellers = new Set([...mk.map((o) => o.sellerTenantId), ...db.tenants.filter((t) => (db.tenantStats[t.id]?.monthMarket ?? 0) > 0).map((t) => t.id)]).size;
    const changes = (Object.keys(CFG_FMT) as (keyof typeof CFG_FMT)[]).filter((k) => cur[k] !== next[k]).map((k) => ({ field: CFG_FMT[k][0], from: CFG_FMT[k][1](cur[k] as never), to: CFG_FMT[k][1](next[k] as never) }));
    const notes: string[] = [];
    if (cur.commissionRate !== next.commissionRate || cur.gatewayFeeRate !== next.gatewayFeeRate) {
      const delta = Math.round(gross * (next.commissionRate - cur.commissionRate));
      notes.push(`On the last 30 days of marketplace sales (₹${gross.toLocaleString('en-IN')} from ${sellers} workspaces), Bodhin would earn ${delta >= 0 ? '+' : '−'}₹${Math.abs(delta).toLocaleString('en-IN')} commission and educators ${delta >= 0 ? '−' : '+'}₹${Math.abs(delta).toLocaleString('en-IN')}.`);
      notes.push('Applies only to new marketplace sales. Past orders keep the split they were sold with. Educators are notified.');
    }
    if (cur.refundHoldDays !== next.refundHoldDays || cur.payoutWeekday !== next.payoutWeekday) notes.push('New payout timing applies to sales from now; already scheduled payouts keep their date.');
    if (cur.trialDays !== next.trialDays || cur.trialPlan !== next.trialPlan) notes.push('Applies to educators approved from now. Running trials keep their end date.');
    if (next.commissionRate > 0.35) notes.push('⚠ Commission above 35% is likely to push educators to sell only on their own sites.');
    return { changes, notes, educators: db.tenants.filter((t) => t.id !== cur.bodhinTenantId && t.subscription?.status !== 'cancelled').length };
  },

  async savePlatform(userId: string, next: Cfg, reason: string) {
    await wait(500);
    const { user } = adminGuard(userId, 'config.edit');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Add a reason — it’s kept in the change history.', 'reason');
    if (next.commissionRate < 0 || next.commissionRate > 0.5) throw new ApiError('range', 'Commission must be between 0% and 50%.');
    if (next.gatewayFeeRate < 0 || next.gatewayFeeRate > 0.05) throw new ApiError('range', 'Gateway fee must be between 0% and 5%.');
    if (!(next.refundHoldDays >= 0 && next.refundHoldDays <= 30)) throw new ApiError('range', 'Refund hold must be 0–30 days.');
    if (!(Number.isInteger(next.payoutWeekday) && next.payoutWeekday >= 0 && next.payoutWeekday <= 6)) throw new ApiError('range', 'Pick a payout day.');
    if (!(next.trialDays >= 0 && next.trialDays <= 60)) throw new ApiError('range', 'Trial must be 0–60 days.');
    if (!(next.attributionDays >= 0 && next.attributionDays <= 365)) throw new ApiError('range', 'Attribution window must be 0–365 days.');
    const tp = PLANS.find((p) => p.id === next.trialPlan);
    if (!tp || tp.monthlyInr == null) throw new ApiError('range', 'Trial plan must be a priced plan (not Enterprise).');
    next = { ...next, bodhinTenantId: db.platformConfig.bodhinTenantId }; // never changeable from the portal
    const imp = settingsAdmin.platformImpact(next);
    if (!imp.changes.length) throw new ApiError('none', 'Nothing changed.');
    const before = { ...db.platformConfig };
    Object.assign(db.platformConfig, next);
    db.configHistory.unshift({ id: uid('ch'), at: new Date().toISOString(), by: user.name, area: 'platform', label: 'Platform rules', changes: imp.changes, reason: reason.trim() });
    audit(userId, 'config.update', { kind: 'config', id: 'platform', label: 'Platform rules' }, imp.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(' · '), before, { ...db.platformConfig });
    if (before.commissionRate !== next.commissionRate || before.refundHoldDays !== next.refundHoldDays || before.payoutWeekday !== next.payoutWeekday)
      db.tenants.filter((t) => t.ownerUserId && t.id !== next.bodhinTenantId).forEach((t) => notifyUser(t.ownerUserId!, 'system', 'Bodhin marketplace terms updated', imp.changes.map((c) => `${c.field}: ${c.to}`).join(' · ') + '. Applies to new marketplace sales.'));
    persist();
  },

  plans(userId: string) {
    const { role } = adminGuard(userId, 'overview');
    const tenants = db.tenants.filter((t) => t.id !== db.platformConfig.bodhinTenantId);
    return {
      rows: PLANS.map((p) => {
        const on = tenants.filter((t) => t.subscription?.plan === p.id && t.subscription.status !== 'cancelled');
        return { p, tenants: on.length, paying: on.filter((t) => t.subscription!.status === 'active' || t.subscription!.status === 'past_due').length, trials: on.filter((t) => t.subscription!.status === 'trialing').length, mrr: on.reduce((s, t) => s + monthlyPrice(t), 0), features: PLAN_FEATURES[p.id].length };
      }),
      addons: ADDON_CATALOG.map((a) => ({ ...a, inUse: tenants.filter((t) => t.subscription?.addons.some((x) => x.kind === a.kind)).length })),
      canEdit: ROLE_PERMS[role].includes('plans.edit'),
      history: db.configHistory.filter((h) => h.area !== 'platform'),
    };
  },

  plan(userId: string, id: PlanId) {
    adminGuard(userId, 'overview');
    const p = PLANS.find((x) => x.id === id)!;
    return { p: { ...p }, features: [...PLAN_FEATURES[id]], all: Object.keys(FEATURE_LABEL), history: db.configHistory.filter((h) => h.area === 'plan' && h.label === p.name) };
  },

  /** Impact of a plan edit on workspaces currently on it. */
  planImpact(id: PlanId, next: Plan, features: string[]) {
    const cur = PLANS.find((x) => x.id === id)!;
    const on = db.tenants.filter((t) => t.subscription?.plan === id && t.subscription.status !== 'cancelled');
    const over: { name: string; what: string }[] = [];
    on.forEach((t) => {
      const u = db.usage[t.id];
      if (!u) return;
      const ov = t.subscription?.overrides?.limits ?? {};
      const chk: [string, number, number | null | undefined][] = [['students', u.activeStudents, ov.activeStudents !== undefined ? ov.activeStudents : next.activeStudents], ['GB storage', u.storageGb, ov.storageGb !== undefined ? ov.storageGb : next.videoStorageGb], ['live hours', u.liveHours, ov.liveHours !== undefined ? ov.liveHours : next.liveRoomHoursPerMonth], ['tutor seats', u.tutorSeats, ov.tutorSeats !== undefined ? ov.tutorSeats : next.tutorSeats]];
      chk.forEach(([w, used, lim]) => { if (lim != null && used > lim) over.push({ name: t.branding.displayName, what: `${used} ${w} (new limit ${lim})` }); });
    });
    const lost = PLAN_FEATURES[id].filter((f) => !features.includes(f));
    const gained = features.filter((f) => !PLAN_FEATURES[id].includes(f as never));
    const fmt = (v: number | null) => (v == null ? 'Custom' : `₹${v.toLocaleString('en-IN')}`);
    const lim = (v: number | null) => (v == null ? '∞' : String(v));
    const changes: { field: string; from: string; to: string }[] = [];
    const add = (field: string, a: string, b: string) => { if (a !== b) changes.push({ field, from: a, to: b }); };
    add('Monthly price', fmt(cur.monthlyInr), fmt(next.monthlyInr));
    add('Annual price', fmt(cur.annualInr), fmt(next.annualInr));
    add('Active students', lim(cur.activeStudents), lim(next.activeStudents));
    add('Video storage (GB)', lim(cur.videoStorageGb), lim(next.videoStorageGb));
    add('Live hours / month', lim(cur.liveRoomHoursPerMonth), lim(next.liveRoomHoursPerMonth));
    add('Tutor seats', lim(cur.tutorSeats), lim(next.tutorSeats));
    add('Custom domain', cur.customDomain, next.customDomain);
    add('Best for', cur.bestFor, next.bestFor);
    add('Recommended', cur.recommended ? 'yes' : 'no', next.recommended ? 'yes' : 'no');
    if (lost.length) changes.push({ field: 'Features removed', from: '', to: lost.map((f) => FEATURE_LABEL[f]).join(', ') });
    if (gained.length) changes.push({ field: 'Features added', from: '', to: gained.map((f) => FEATURE_LABEL[f]).join(', ') });
    const priceUp = (next.monthlyInr ?? 0) > (cur.monthlyInr ?? 0) || (next.annualInr ?? 0) > (cur.annualInr ?? 0);
    const priceDown = (next.monthlyInr ?? 0) < (cur.monthlyInr ?? 0) || (next.annualInr ?? 0) < (cur.annualInr ?? 0);
    const notes: string[] = [];
    if (priceUp) notes.push(`New sign-ups pay the new price now. ${on.length} existing workspace${on.length === 1 ? '' : 's'} keep the old price until their next renewal, with at least ${NOTICE_DAYS} days’ notice (sent automatically).`);
    if (priceDown) notes.push('Price drops apply to everyone at their next renewal; no notice needed.');
    if (over.length) notes.push(`${over.length} limit${over.length === 1 ? '' : 's'} would be exceeded. Nothing is deleted — those workspaces just can’t add more until they upgrade or reduce usage. Consider a per-workspace override in Tenants.`);
    if (lost.length) notes.push(`${on.length} workspace${on.length === 1 ? '' : 's'} lose ${lost.map((f) => FEATURE_LABEL[f]).join(', ')} immediately. Existing content stays but those tools hide.`);
    return { changes, notes, over, tenants: on.length };
  },

  async savePlan(userId: string, id: PlanId, next: Plan, features: string[], reason: string) {
    await wait(500);
    const { user } = adminGuard(userId, 'plans.edit');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Add a reason — it’s kept in the change history.', 'reason');
    if (id !== 'enterprise' && (next.monthlyInr == null || next.monthlyInr < 0 || next.annualInr == null || next.annualInr < 0)) throw new ApiError('price', 'Set both monthly and annual prices.', 'price');
    if (id !== 'enterprise' && next.annualInr! > next.monthlyInr! * 12) throw new ApiError('price', 'Annual price should not be more than 12 × monthly.', 'price');
    if (!features.includes('courses')) throw new ApiError('features', 'Every plan needs Courses.', 'features');
    const imp = settingsAdmin.planImpact(id, next, features);
    if (!imp.changes.length) throw new ApiError('none', 'Nothing changed.');
    const cur = PLANS.find((x) => x.id === id)!;
    const priceUp = (next.monthlyInr ?? 0) > (cur.monthlyInr ?? 0) || (next.annualInr ?? 0) > (cur.annualInr ?? 0);
    if (priceUp) {
      db.tenants.filter((t) => t.subscription?.plan === id && t.subscription.status !== 'cancelled').forEach((t) => {
        const sub = t.subscription!;
        const until = new Date(Math.max(new Date(sub.periodEnd).getTime(), Date.now() + NOTICE_DAYS * 864e5)).toISOString();
        // Keep the price they pay today (an earlier lock if still running); every rise gets a fresh notice period.
        const pays = planPriceOf(sub);
        const keepUntil = pays.lockedUntil && pays.lockedUntil > until ? pays.lockedUntil : until;
        sub.priceLock = { plan: id, monthlyInr: pays.monthly, annualInr: pays.annual, until: keepUntil };
        if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', `${cur.name} plan price changes on ${new Date(keepUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, `You keep your current price until then. New price: ₹${(next.monthlyInr ?? 0).toLocaleString('en-IN')}/month or ₹${(next.annualInr ?? 0).toLocaleString('en-IN')}/year.`);
      });
    }
    db.catalog.plans[id] = { monthlyInr: next.monthlyInr, annualInr: next.annualInr, activeStudents: next.activeStudents, videoStorageGb: next.videoStorageGb, liveRoomHoursPerMonth: next.liveRoomHoursPerMonth, tutorSeats: next.tutorSeats, customDomain: next.customDomain, recommended: next.recommended, bestFor: next.bestFor };
    if (next.recommended) PLANS.filter((p) => p.id !== id && p.recommended).forEach((p) => { db.catalog.plans[p.id] = { ...(db.catalog.plans[p.id] ?? {}), recommended: false }; });
    db.catalog.features[id] = features;
    syncCatalog();
    db.configHistory.unshift({ id: uid('ch'), at: new Date().toISOString(), by: user.name, area: 'plan', label: cur.name, changes: imp.changes, reason: reason.trim() });
    audit(userId, 'plan.update', { kind: 'plan', id, label: cur.name }, imp.changes.map((c) => `${c.field}: ${c.from ? `${c.from} → ` : ''}${c.to}`).join(' · '));
    persist();
  },

  async saveAddon(userId: string, kind: (typeof ADDON_CATALOG)[number]['kind'], price: number, reason: string) {
    await wait(300);
    const { user } = adminGuard(userId, 'plans.edit');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Add a reason.', 'reason');
    if (!(price >= 0 && price <= 100000)) throw new ApiError('price', 'Enter a valid price.', 'price');
    const a = ADDON_CATALOG.find((x) => x.kind === kind)!;
    if (a.monthlyInr === price) throw new ApiError('none', 'Nothing changed.');
    const from = a.monthlyInr;
    db.catalog.addonPrices[kind] = price;
    syncCatalog();
    db.configHistory.unshift({ id: uid('ch'), at: new Date().toISOString(), by: user.name, area: 'addon', label: a.label, changes: [{ field: 'Monthly price', from: `₹${from}`, to: `₹${price}` }], reason: reason.trim() });
    audit(userId, 'addon.update', { kind: 'plan', id: kind, label: a.label }, `Price ₹${from} → ₹${price}`);
    persist();
  },
};

/* ───────────────────────── Money: payouts, refunds, billing, reports (SA5) ───────────────────────── */

export const money = {
  /** Draft payout run for the next payout day: one line per workspace with marketplace earnings due. */
  payoutRun(userId: string) {
    const { role } = adminGuard(userId, 'money.view');
    const date = nextPayoutDate();
    const open = db.orders.filter((o) => o.channel === 'bodhin_marketplace' && o.status === 'paid' && o.payoutStatus !== 'paid' && o.payoutDate);
    const due = open.filter((o) => dueBy(o.payoutDate, date));
    const later = open.filter((o) => !dueBy(o.payoutDate, date));
    const ids = new Set([...due.map((o) => o.sellerTenantId!), ...db.tenants.filter((t) => (db.tenantStats[t.id]?.payoutDue ?? 0) > 0).map((t) => t.id)]);
    const lines = [...ids].map((tid) => {
      const t = db.tenants.find((x) => x.id === tid)!;
      // Orders with an open refund request stay out of this run until the refund is decided (not deducted twice).
      const disputed = new Set(db.refundRequests.filter((r) => r.status === 'open').map((r) => r.orderId));
      const held = due.filter((o) => o.sellerTenantId === tid && disputed.has(o.id));
      const mine = due.filter((o) => o.sellerTenantId === tid && !disputed.has(o.id));
      const extra = db.tenantStats[tid]?.payoutDue ?? 0;
      const refundHold = held.reduce((s, o) => s + o.educatorShareInr, 0);
      const gross = mine.reduce((s, o) => s + o.amountInr, 0) + Math.round(extra / (1 - db.platformConfig.commissionRate - db.platformConfig.gatewayFeeRate));
      const amount = mine.reduce((s, o) => s + o.educatorShareInr, 0) + extra;
      const bank = t.payments?.payoutAccount?.verified ? `${t.payments.payoutAccount.bank} ••${t.payments.payoutAccount.last4}` : null;
      const hold = db.payoutHolds[tid] ?? null;
      const blocked = !bank ? 'No verified bank account' : t.status === 'suspended' ? 'Workspace suspended' : hold ? `On hold: ${hold.reason}` : null;
      return { t, amount: Math.max(0, amount), refundHold, orderIds: mine.map((o) => o.id), gross, orders: mine.length + (extra ? Math.max(1, Math.round(extra / 2500)) : 0), bank, hold, blocked };
    }).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
    const ready = lines.filter((l) => !l.blocked);
    return {
      date, lines, readyTotal: ready.reduce((s, l) => s + l.amount, 0), heldTotal: lines.filter((l) => l.blocked).reduce((s, l) => s + l.amount, 0),
      nextWeek: later.reduce((s, o) => s + o.educatorShareInr, 0),
      runs: db.payoutRuns, approved: db.payoutRuns.find((r) => r.status === 'approved') ?? null,
      canRun: ROLE_PERMS[role].includes('payouts.run'), cfg: db.platformConfig,
    };
  },

  hold(userId: string, tenantId: string, reason: string) {
    adminGuard(userId, 'payouts.run');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Add a reason (shown to Finance and logged).', 'reason');
    const u = db.users.find((x) => x.id === userId)!;
    db.payoutHolds[tenantId] = { reason: reason.trim(), by: u.name, at: new Date().toISOString() };
    const t = db.tenants.find((x) => x.id === tenantId)!;
    audit(userId, 'payout.hold', { kind: 'tenant', id: tenantId, label: t.branding.displayName }, `Held payouts: ${reason.trim()}`);
    persist();
  },
  release(userId: string, tenantId: string) {
    adminGuard(userId, 'payouts.run');
    delete db.payoutHolds[tenantId];
    const t = db.tenants.find((x) => x.id === tenantId)!;
    audit(userId, 'payout.release', { kind: 'tenant', id: tenantId, label: t.branding.displayName }, 'Released payout hold');
    persist();
  },

  /** Step 1: Finance approves the run (four-eyes: real system can require a second approver). */
  async approveRun(userId: string) {
    await wait(500);
    const { user } = adminGuard(userId, 'payouts.run');
    if (db.payoutRuns.some((r) => r.status === 'approved')) throw new ApiError('state', 'A run is already approved — release it first.');
    const run = money.payoutRun(userId);
    const ready = run.lines.filter((l) => !l.blocked);
    if (!ready.length) throw new ApiError('empty', 'Nothing ready to pay.');
    const id = `po_${new Date(run.date).getFullYear()}_${Math.ceil((new Date(run.date).getTime() - new Date(new Date(run.date).getFullYear(), 0, 1).getTime()) / 6048e5)}`;
    db.payoutRuns.unshift({ id, date: run.date, status: 'approved', approvedBy: user.name, approvedAt: new Date().toISOString(), lines: ready.map((l) => ({ tenantId: l.t.id, name: l.t.branding.displayName, amount: l.amount, orders: l.orders, bank: l.bank!, orderIds: l.orderIds })) });
    audit(userId, 'payout.approve', { kind: 'payout', id, label: `Payout run · ${new Date(run.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` }, `Approved ₹${run.readyTotal.toLocaleString('en-IN')} to ${ready.length} workspaces`);
    persist();
    return id;
  },

  /** Step 2: release via RazorpayX (POC: instant success with generated UTRs). Marks orders paid and notifies educators. */
  async releaseRun(userId: string, runId: string) {
    await wait(1200);
    adminGuard(userId, 'payouts.run');
    const r = db.payoutRuns.find((x) => x.id === runId && x.status === 'approved');
    if (!r) throw new ApiError('state', 'Run not found or already paid.');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    r.lines.forEach((l, i) => {
      const code = /HDFC/i.test(l.bank) ? 'HDFC' : /ICICI/i.test(l.bank) ? 'ICIC' : /State Bank/i.test(l.bank) ? 'SBIN' : /Axis/i.test(l.bank) ? 'UTIB' : /Kotak/i.test(l.bank) ? 'KKBK' : 'NEFT';
      l.utr = `${code}R5${stamp}${String(i + 1).padStart(2, '0')}`;
      db.orders.filter((o) => (l.orderIds ? l.orderIds.includes(o.id) : o.sellerTenantId === l.tenantId && o.channel === 'bodhin_marketplace' && dueBy(o.payoutDate, r.date)) && o.status === 'paid' && o.payoutStatus !== 'paid').forEach((o) => (o.payoutStatus = 'paid'));
      if (db.tenantStats[l.tenantId]) db.tenantStats[l.tenantId].payoutDue = 0;
      const t = db.tenants.find((x) => x.id === l.tenantId);
      if (t?.ownerUserId) notifyUser(t.ownerUserId, 'system', `Payout sent: ₹${l.amount.toLocaleString('en-IN')}`, `To ${l.bank} · UTR ${l.utr}. Statement in Earnings & payouts.`, { pathname: '/edu/earnings' });
    });
    Object.assign(r, { status: 'paid', paidAt: new Date().toISOString() });
    audit(userId, 'payout.run', { kind: 'payout', id: runId, label: `Payout run · ${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` }, `Released ₹${r.lines.reduce((s, l) => s + l.amount, 0).toLocaleString('en-IN')} to ${r.lines.length} workspaces`);
    persist();
  },

  refunds(userId: string) {
    const { role } = adminGuard(userId, 'money.view');
    const rows = db.refundRequests.map((r) => {
      const o = db.orders.find((x) => x.id === r.orderId) ?? null;
      return { r, o, plan: money.refundPlan(r.orderId, r.amountInr) };
    }).sort((a, b) => (a.r.status === 'open' ? -1 : 1) - (b.r.status === 'open' ? -1 : 1) || a.r.at.localeCompare(b.r.at));
    return { rows, canRefund: ROLE_PERMS[role].includes('refunds') };
  },

  /** Who refunds what, by channel — the reversal shown before approving. */
  refundPlan(orderId: string, amount: number) {
    const o = db.orders.find((x) => x.id === orderId);
    const ch = o?.channel ?? 'bodhin_own';
    if (ch === 'tutor_direct') return { ch, payer: 'educator' as const, lines: [['Refund from', 'Educator’s own gateway'], ['Bodhin', 'No money involved (0% commission)']] as [string, string][], note: 'Bodhin didn’t collect this payment. Forward to the educator — they refund from their Razorpay/Cashfree.' };
    if (ch === 'bodhin_marketplace' && o) {
      const paidOut = o.payoutStatus === 'paid';
      return { ch, payer: 'bodhin' as const, lines: [['Refund to learner', `₹${amount.toLocaleString('en-IN')}`], ['Commission reversed', `−₹${o.commissionInr.toLocaleString('en-IN')} (Bodhin)`], ['Gateway fee', `₹${(o.gatewayFeeInr ?? 0).toLocaleString('en-IN')} not recoverable`], ['Educator share', `−₹${o.educatorShareInr.toLocaleString('en-IN')} ${paidOut ? '(already paid → deducted from next payout)' : '(cancelled from pending payout)'}`]] as [string, string][], note: 'Learner loses access to the course.' };
    }
    return { ch, payer: 'bodhin' as const, lines: [['Refund to learner', `₹${amount.toLocaleString('en-IN')}`], ['From', 'Bodhin (own course)']] as [string, string][], note: 'Learner loses access to the course.' };
  },

  async decideRefund(userId: string, id: string, decision: 'approved' | 'rejected', note: string) {
    await wait(600);
    adminGuard(userId, 'refunds');
    const r = db.refundRequests.find((x) => x.id === id);
    if (!r || r.status !== 'open') throw new ApiError('state', 'Already decided.');
    if (decision === 'rejected' && note.trim().length < 5) throw new ApiError('note', 'Tell the learner why (5+ characters).', 'note');
    const o = db.orders.find((x) => x.id === r.orderId);
    const plan = money.refundPlan(r.orderId, r.amountInr);
    if (decision === 'approved' && plan.payer === 'educator') throw new ApiError('channel', 'This was a direct sale — the educator must refund it from their gateway.');
    r.status = decision;
    if (decision === 'approved' && o) {
      const wasPaid = o.payoutStatus === 'paid';
      o.status = 'refunded';
      if (o.channel === 'bodhin_marketplace' && !wasPaid) o.payoutStatus = 'not_applicable';
      if (o.channel === 'bodhin_marketplace' && wasPaid && db.tenantStats[o.sellerTenantId!]) db.tenantStats[o.sellerTenantId!].payoutDue = (db.tenantStats[o.sellerTenantId!].payoutDue ?? 0) - o.educatorShareInr;
      db.enrollments = db.enrollments.filter((e) => !(e.userId === o.userId && e.courseId === o.courseId));
      if (db.users.some((u) => u.id === o.userId)) notifyUser(o.userId, 'system', `Refund approved: ₹${r.amountInr.toLocaleString('en-IN')}`, 'It reaches your original payment method in 5–7 working days.', { pathname: '/payments' });
      const t = db.tenants.find((x) => x.id === r.tenantId);
      if (t?.ownerUserId && t.id !== db.platformConfig.bodhinTenantId) notifyUser(t.ownerUserId, 'system', `Refund on “${r.course}”`, `₹${o.educatorShareInr.toLocaleString('en-IN')} ${wasPaid ? 'will be deducted from your next payout' : 'removed from your pending payout'}.`, { pathname: '/edu/earnings' });
    } else if (o && db.users.some((u) => u.id === o.userId)) notifyUser(o.userId, 'system', 'Refund request not approved', note.trim());
    audit(userId, decision === 'approved' ? 'refund.approve' : 'refund.reject', { kind: 'order', id: r.orderId, label: `${r.buyer} · ${r.course}` }, decision === 'approved' ? `Refunded ₹${r.amountInr.toLocaleString('en-IN')}${o?.channel === 'bodhin_marketplace' ? ' · commission reversed' : ''}` : `Rejected: ${note.trim()}`);
    persist();
  },

  billing(userId: string) {
    adminGuard(userId, 'money.view');
    const ws = db.tenants.filter((t) => t.id !== db.platformConfig.bodhinTenantId && t.subscription);
    const soon = Date.now() + 14 * 864e5;
    const byPlan = PLANS.map((p) => ({ p, mrr: ws.filter((t) => t.subscription!.plan === p.id).reduce((s, t) => s + monthlyPrice(t), 0), n: ws.filter((t) => t.subscription!.plan === p.id && ['active', 'past_due'].includes(t.subscription!.status)).length })).filter((x) => x.n);
    return {
      pastDue: ws.filter((t) => t.subscription!.status === 'past_due').map((t) => ({ t, amount: Math.round(((t.subscription!.billing === 'annual' ? planPriceOf(t.subscription!).annual : planPriceOf(t.subscription!).monthly) ?? 0) * 1.18), days: Math.max(1, Math.round((Date.now() - new Date(t.subscription!.periodEnd).getTime()) / 864e5)) })),
      renewals: ws.filter((t) => t.subscription!.status === 'active' && new Date(t.subscription!.periodEnd).getTime() < soon).sort((a, b) => a.subscription!.periodEnd.localeCompare(b.subscription!.periodEnd)).map((t) => ({ t, at: t.subscription!.periodEnd, amount: Math.round(((t.subscription!.billing === 'annual' ? planPriceOf(t.subscription!).annual : planPriceOf(t.subscription!).monthly) ?? 0) * 1.18), locked: !!planPriceOf(t.subscription!).lockedUntil })),
      trials: ws.filter((t) => t.subscription!.status === 'trialing').sort((a, b) => a.subscription!.periodEnd.localeCompare(b.subscription!.periodEnd)).map((t) => ({ t, days: daysLeft(t.subscription!.periodEnd), ready: t.payments?.directGatewayStatus === 'active' })),
      invoices: db.invoices.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map((i) => ({ i, name: db.tenants.find((t) => t.id === i.tenantId)?.branding.displayName ?? '' })),
      byPlan, mrr: ws.reduce((s, t) => s + monthlyPrice(t), 0),
    };
  },

  async retryCharge(userId: string, tenantId: string) {
    await wait(1100);
    adminGuard(userId, 'money.view');
    const t = db.tenants.find((x) => x.id === tenantId)!;
    const sub = t.subscription!;
    if (sub.status !== 'past_due') throw new ApiError('state', 'Not overdue.');
    const p = PLANS.find((x) => x.id === sub.plan)!;
    const pp = planPriceOf(sub);
    Object.assign(sub, { status: 'active', periodEnd: new Date(Date.now() + (sub.billing === 'annual' ? 365 : 30) * 864e5).toISOString() });
    addInvoice(t.id, `${p.name} plan · ${sub.billing} (retry succeeded)`, ((sub.billing === 'annual' ? pp.annual : pp.monthly) ?? 0) * 1.18);
    audit(userId, 'billing.retry', { kind: 'tenant', id: tenantId, label: t.branding.displayName }, 'Retried card — payment succeeded');
    if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', 'Subscription payment received', `${p.name} plan renewed. Thank you!`, { pathname: '/edu/subscription' });
    persist();
  },
  remind(userId: string, tenantId: string, kind: 'past_due' | 'trial') {
    adminGuard(userId, 'money.view');
    const t = db.tenants.find((x) => x.id === tenantId)!;
    if (t.ownerUserId) notifyUser(t.ownerUserId, 'system', kind === 'past_due' ? 'Action needed: subscription payment failed' : 'Your free trial ends soon', kind === 'past_due' ? 'Update your card in Subscription & usage to keep new enrolments open.' : 'Pick a plan to keep everything running — your content stays safe either way.', { pathname: '/edu/subscription' });
    audit(userId, 'billing.remind', { kind: 'tenant', id: tenantId, label: t.branding.displayName }, kind === 'past_due' ? 'Sent payment reminder' : 'Sent trial-ending reminder');
    persist();
  },

  async report(userId: string) {
    await wait(250);
    const ov = await admin.overview(userId);
    const from = monthStart();
    const paid = db.orders.filter((o) => o.status === 'paid' && new Date(o.createdAt).getTime() >= from);
    const courseSales = new Map<string, { title: string; ws: string; n: number; gross: number }>();
    paid.forEach((o) => {
      const c = seedCourses.find((x) => x.id === o.courseId);
      const k = courseSales.get(o.courseId) ?? { title: c?.title ?? o.courseId, ws: db.tenants.find((t) => t.id === c?.tenantId)?.branding.displayName ?? '', n: 0, gross: 0 };
      k.n += 1;
      k.gross += o.amountInr;
      courseSales.set(o.courseId, k);
    });
    const tops = db.tenants.filter((t) => t.id !== db.platformConfig.bodhinTenantId).map((t) => ({ t, gmv: tenantRowOf(t).gmv, mrr: monthlyPrice(t) })).sort((a, b) => b.gmv - a.gmv).slice(0, 5);
    const refunded = db.orders.filter((o) => o.status === 'refunded' && new Date(o.createdAt).getTime() >= from).reduce((s, o) => s + o.amountInr, 0);
    return { ov, topCourses: [...courseSales.values()].sort((a, b) => b.gross - a.gross).slice(0, 5), topWorkspaces: tops, refunded, months: Array.from({ length: 9 }, (_, i) => new Date(new Date().getFullYear(), new Date().getMonth() - 8 + i, 1).toLocaleDateString('en-IN', { month: 'short' })) };
  },
};

/* ───────────────────────── SA6: content, people, control ───────────────────────── */

export const system = {
  /** Public: maintenance banner + feature flags every app reads (real: /status, cached 60 s). */
  status: () => ({ maintenance: db.flags.maintenance, flags: { tutorSignups: db.flags.tutorSignups, marketplaceCheckout: db.flags.marketplaceCheckout, liveClasses: db.flags.liveClasses } }),
};

export const contentAdmin = {
  bodhinCourses(userId: string) {
    adminGuard(userId, 'content.bodhin');
    const from = monthStart();
    return seedCourses.filter((c) => c.tenantId === db.platformConfig.bodhinTenantId).map((c) => {
      const o = db.orders.filter((x) => x.courseId === c.id && x.status === 'paid');
      return { c, state: courseState(c), sales: o.filter((x) => new Date(x.createdAt).getTime() >= from).reduce((s, x) => s + x.amountInr, 0), orders: o.length, students: c.students + db.enrollments.filter((e) => e.courseId === c.id).length, featured: db.curation.featured.includes(c.id) };
    });
  },
  curation(userId: string) {
    adminGuard(userId, 'content.bodhin');
    const list = visible(null);
    const cats = db.curation.categories ?? seedCategories.map((c) => ({ ...c, hidden: false }));
    return {
      featured: db.curation.featured.map((id) => seedCourses.find((c) => c.id === id)).filter((c): c is Course => !!c),
      banners: db.curation.banners.map((id) => seedCourses.find((c) => c.id === id)).filter((c): c is Course => !!c),
      candidates: list,
      categories: cats.map((k) => ({ ...k, courses: seedCourses.filter((c) => c.categoryId === k.id).length })),
    };
  },
  setList(userId: string, which: 'featured' | 'banners', ids: string[]) {
    adminGuard(userId, 'content.bodhin');
    if (which === 'banners' && ids.length > 3) throw new ApiError('max', 'Up to 3 hero banners.');
    if (which === 'featured' && ids.length > 12) throw new ApiError('max', 'Up to 12 featured courses.');
    const before = [...db.curation[which]];
    db.curation[which] = ids;
    audit(userId, `curation.${which}`, { kind: 'config', id: which, label: which === 'banners' ? 'Marketplace hero banners' : 'Featured courses' }, `${ids.length} course${ids.length === 1 ? '' : 's'}: ${ids.map((id) => seedCourses.find((c) => c.id === id)?.title ?? id).join(', ').slice(0, 120)}`, before, ids);
    persist();
  },
  saveCategory(userId: string, cat: { id?: string; name: string; icon: string; hidden?: boolean }) {
    adminGuard(userId, 'content.bodhin');
    if (cat.name.trim().length < 2) throw new ApiError('name', 'Name the category.', 'name');
    const cats = db.curation.categories ?? seedCategories.map((c) => ({ ...c, hidden: false }));
    if (cat.id) {
      const k = cats.find((x) => x.id === cat.id);
      if (!k) throw new ApiError('not_found', 'Category not found.');
      if (k.id === 'all' && cat.hidden) throw new ApiError('all', '“All Courses” can’t be hidden.');
      Object.assign(k, { name: cat.name.trim(), icon: cat.icon, hidden: !!cat.hidden });
    } else {
      const id = cat.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (cats.some((x) => x.id === id)) throw new ApiError('dup', 'A category with this name exists.', 'name');
      cats.push({ id, name: cat.name.trim(), icon: cat.icon, hidden: false });
    }
    db.curation.categories = cats;
    audit(userId, 'curation.category', { kind: 'config', id: cat.id ?? 'new', label: cat.name.trim() }, cat.id ? `Updated category${cat.hidden ? ' (hidden)' : ''}` : 'Added category');
    persist();
  },
};

export type UserFilter = 'all' | 'students' | 'educators' | 'staff' | 'locked';

export const usersAdmin = {
  list(userId: string, filter: UserFilter, q: string) {
    adminGuard(userId, 'users.view');
    const s = q.trim().toLowerCase();
    const kind = (id: string) => {
      const roles = db.memberships.filter((m) => m.userId === id).map((m) => m.role);
      return roles.some(isAdminRole) ? 'staff' : roles.some((r) => r === 'owner' || r === 'tutor') ? 'educators' : 'students';
    };
    const all = db.users.map((u) => ({ u, kind: kind(u.id), locked: !!db.userLocks[u.id], enrolments: db.enrollments.filter((e) => e.userId === u.id).length }));
    const rows = all.filter((r) => (filter === 'all' || (filter === 'locked' ? r.locked : r.kind === filter)) && (!s || [r.u.name, r.u.email, r.u.phone].some((x) => x.toLowerCase().includes(s)))).sort((a, b) => b.u.createdAt.localeCompare(a.u.createdAt)).slice(0, 60);
    const counts = { all: all.length, students: all.filter((r) => r.kind === 'students').length, educators: all.filter((r) => r.kind === 'educators').length, staff: all.filter((r) => r.kind === 'staff').length, locked: all.filter((r) => r.locked).length };
    return { rows, counts };
  },
  detail(userId: string, id: string) {
    const { role } = adminGuard(userId, 'users.view');
    const u = db.users.find((x) => x.id === id);
    if (!u) return null;
    return {
      u, lock: db.userLocks[id] ?? null,
      memberships: db.memberships.filter((m) => m.userId === id).map((m) => ({ ...m, tenant: db.tenants.find((t) => t.id === m.tenantId)?.branding.displayName ?? m.tenantId })),
      enrolments: db.enrollments.filter((e) => e.userId === id).map((e) => ({ e, c: seedCourses.find((c) => c.id === e.courseId) })),
      orders: db.orders.filter((o) => o.userId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      tickets: db.tickets.filter((t) => t.userId === id),
      log: db.audit.filter((e) => e.target.id === id),
      canManage: ROLE_PERMS[role].includes('users.manage'),
      isStaff: db.memberships.some((m) => m.userId === id && isAdminRole(m.role)),
    };
  },
  async act(userId: string, id: string, a: { kind: 'lock'; reason: string } | { kind: 'unlock' } | { kind: 'reset' } | { kind: 'verify_phone' } | { kind: 'grant'; courseId: string; reason: string } | { kind: 'revoke'; courseId: string; reason: string }) {
    await wait(350);
    const { user } = adminGuard(userId, 'users.manage');
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'User not found.');
    const target = { kind: 'user' as const, id, label: u.name };
    if (id === userId && a.kind === 'lock') throw new ApiError('self', 'You can’t lock your own account.');
    if (a.kind === 'lock' && db.memberships.some((m) => m.userId === id && m.role === 'super_admin') && adminRoleOf(userId) !== 'super_admin') throw new ApiError('forbidden', 'Only a Super Admin can lock another Super Admin.');
    if ((a.kind === 'lock' || a.kind === 'grant' || a.kind === 'revoke') && a.reason.trim().length < 5) throw new ApiError('reason', 'Add a reason for the audit log.', 'reason');
    switch (a.kind) {
      case 'lock':
        db.userLocks[id] = { reason: a.reason.trim(), by: user.name, at: new Date().toISOString() };
        delete db.adminVerified[id];
        audit(userId, 'user.lock', target, `Locked: ${a.reason.trim()}`);
        break;
      case 'unlock':
        delete db.userLocks[id];
        audit(userId, 'user.unlock', target, 'Unlocked');
        break;
      case 'reset':
        notifyUser(id, 'system', 'Reset your Bodhin password', 'We received a request from Bodhin support. Use “Forgot password” on the sign-in screen within 30 minutes.');
        audit(userId, 'user.reset_password', target, 'Sent password reset link');
        break;
      case 'verify_phone':
        u.phoneVerified = true;
        audit(userId, 'user.verify_phone', target, 'Marked phone as verified (checked on call)');
        break;
      case 'grant': {
        const c = seedCourses.find((x) => x.id === a.courseId);
        if (!c) throw new ApiError('course', 'Pick a course.', 'course');
        enroll(id, c.id, 'direct');
        notifyUser(id, 'course', `You now have access to “${c.title}”`, 'Added by Bodhin support. Open My Learning to start.', { pathname: '/course/[id]', params: { id: c.id } });
        audit(userId, 'user.grant_course', target, `Granted “${c.title}” · ${a.reason.trim()}`);
        break;
      }
      case 'revoke': {
        const c = seedCourses.find((x) => x.id === a.courseId);
        db.enrollments = db.enrollments.filter((e) => !(e.userId === id && e.courseId === a.courseId));
        audit(userId, 'user.revoke_course', target, `Removed access to “${c?.title ?? a.courseId}” · ${a.reason.trim()}`);
        break;
      }
    }
    persist();
  },
};

export type TicketFilter = 'open' | 'in_progress' | 'resolved';

export const ticketsAdmin = {
  list(userId: string, filter: TicketFilter) {
    adminGuard(userId, 'support.tickets');
    const rows = db.tickets.filter((t) => t.status === filter).sort((a, b) => (filter === 'resolved' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))).map((t) => ({ t, u: db.users.find((x) => x.id === t.userId) ?? null }));
    const counts = { open: db.tickets.filter((t) => t.status === 'open').length, in_progress: db.tickets.filter((t) => t.status === 'in_progress').length, resolved: db.tickets.filter((t) => t.status === 'resolved').length };
    return { rows, counts };
  },
  async reply(userId: string, id: string, text: string, resolve: boolean) {
    await wait(400);
    const { user } = adminGuard(userId, 'support.tickets');
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('not_found', 'Ticket not found.');
    if (text.trim().length < 5 && !resolve) throw new ApiError('text', 'Write a reply (5+ characters).', 'text');
    if (text.trim()) t.replies.push({ by: `${user.name.split(' ')[0]} · Bodhin Support`, text: text.trim(), at: new Date().toISOString() });
    t.status = resolve ? 'resolved' : 'in_progress';
    notifyUser(t.userId, 'system', resolve ? `Ticket ${t.id} resolved` : `Reply on ticket ${t.id}`, text.trim() || 'Marked as resolved by Bodhin Support.', { pathname: '/help' });
    audit(userId, resolve ? 'ticket.resolve' : 'ticket.reply', { kind: 'user', id: t.userId, label: `${t.id} · ${t.subject}` }, resolve ? 'Resolved ticket' : 'Replied to ticket');
    persist();
  },
  reopen(userId: string, id: string) {
    adminGuard(userId, 'support.tickets');
    const t = db.tickets.find((x) => x.id === id);
    if (t) t.status = 'open';
    persist();
  },
};

export type Audience = 'all_students' | 'all_educators' | 'trial_educators' | 'paying_educators' | 'everyone';
function audienceUsers(a: Audience) {
  const owners = (pred: (t: Tenant) => boolean) => db.tenants.filter((t) => t.id !== db.platformConfig.bodhinTenantId && t.ownerUserId && pred(t)).map((t) => t.ownerUserId!);
  const educators = [...new Set([...owners(() => true), ...db.memberships.filter((m) => m.role === 'tutor').map((m) => m.userId)])];
  const students = [...new Set(db.memberships.filter((m) => m.role === 'student').map((m) => m.userId))].filter((id) => !educators.includes(id) && !db.memberships.some((m) => m.userId === id && isAdminRole(m.role)));
  return { all_students: students, all_educators: educators, trial_educators: owners((t) => t.subscription?.status === 'trialing'), paying_educators: owners((t) => t.subscription?.status === 'active' || t.subscription?.status === 'past_due'), everyone: [...new Set([...students, ...educators])] }[a];
}
export const AUDIENCE_LABEL: Record<Audience, string> = { all_students: 'All learners', all_educators: 'All educators', trial_educators: 'Educators on trial', paying_educators: 'Paying educators', everyone: 'Everyone' };

export const broadcastAdmin = {
  info(userId: string) {
    adminGuard(userId, 'broadcast');
    return { counts: Object.fromEntries((Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => [a, audienceUsers(a).length])) as Record<Audience, number>, history: db.broadcasts };
  },
  async send(userId: string, input: { audience: Audience; title: string; body: string }) {
    await wait(600);
    const { user } = adminGuard(userId, 'broadcast');
    if (input.title.trim().length < 4) throw new ApiError('title', 'Add a title (4+ characters).', 'title');
    if (input.body.trim().length < 10) throw new ApiError('body', 'Write the message (10+ characters).', 'body');
    const ids = audienceUsers(input.audience);
    ids.forEach((id) => notifyUser(id, 'system', input.title.trim(), input.body.trim()));
    db.broadcasts.unshift({ id: uid('bc'), at: new Date().toISOString(), by: user.name, audience: AUDIENCE_LABEL[input.audience], title: input.title.trim(), body: input.body.trim(), reached: ids.length });
    audit(userId, 'broadcast.send', { kind: 'config', id: 'broadcast', label: input.title.trim() }, `Sent to ${AUDIENCE_LABEL[input.audience]} (${ids.length})`);
    persist();
    return ids.length;
  },
};

export const staffAdmin = {
  list(userId: string) {
    adminGuard(userId, 'admins.manage');
    return db.memberships.filter((m) => isAdminRole(m.role)).map((m) => ({ u: db.users.find((x) => x.id === m.userId)!, role: m.role as AdminRole, locked: !!db.userLocks[m.userId], lastSignIn: db.audit.find((e) => e.actorId === m.userId && e.action === 'admin.sign_in')?.at ?? null }));
  },
  async invite(userId: string, input: { name: string; email: string; role: AdminRole }) {
    await wait(400);
    adminGuard(userId, 'admins.manage');
    const email = input.email.trim().toLowerCase();
    if (input.name.trim().length < 2) throw new ApiError('name', 'Enter a name.', 'name');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('email', 'Enter a valid work email.', 'email');
    let u = db.users.find((x) => x.email === email);
    if (u && db.memberships.some((m) => m.userId === u!.id && isAdminRole(m.role))) throw new ApiError('email', 'Already on the admin team.', 'email');
    if (!u) {
      u = { id: uid('u'), name: input.name.trim(), email, phone: `+9190000${String(10000 + db.users.length).slice(-5)}`, phoneVerified: false, password: 'demo123', createdAt: new Date().toISOString() };
      db.users.push(u);
    }
    db.memberships.push({ userId: u.id, tenantId: db.platformConfig.bodhinTenantId, role: input.role });
    audit(userId, 'admin.invite', { kind: 'admin', id: u.id, label: u.name }, `Added as ${input.role.replace('_', ' ')}`);
    persist();
    return u.email;
  },
  setRole(userId: string, staffId: string, role: AdminRole) {
    adminGuard(userId, 'admins.manage');
    const m = db.memberships.find((x) => x.userId === staffId && isAdminRole(x.role));
    if (!m) throw new ApiError('not_found', 'Not a staff member.');
    if (m.role === 'super_admin' && role !== 'super_admin' && db.memberships.filter((x) => x.role === 'super_admin').length <= 1) throw new ApiError('last', 'Keep at least one Super Admin.');
    const from = m.role;
    m.role = role;
    audit(userId, 'admin.role', { kind: 'admin', id: staffId, label: db.users.find((u) => u.id === staffId)!.name }, `Role ${from} → ${role}`);
    persist();
  },
  remove(userId: string, staffId: string) {
    adminGuard(userId, 'admins.manage');
    if (staffId === userId) throw new ApiError('self', 'You can’t remove yourself.');
    const m = db.memberships.find((x) => x.userId === staffId && isAdminRole(x.role));
    if (m?.role === 'super_admin' && db.memberships.filter((x) => x.role === 'super_admin').length <= 1) throw new ApiError('last', 'Keep at least one Super Admin.');
    db.memberships = db.memberships.filter((x) => !(x.userId === staffId && isAdminRole(x.role)));
    delete db.adminVerified[staffId];
    audit(userId, 'admin.remove', { kind: 'admin', id: staffId, label: db.users.find((u) => u.id === staffId)!.name }, 'Removed from admin team');
    persist();
  },
};

export const auditAdmin = {
  list(userId: string, area: string, q: string) {
    adminGuard(userId, 'audit.view');
    const s = q.trim().toLowerCase();
    const rows = db.audit.filter((e) => (area === 'all' || e.action.startsWith(area)) && (!s || [e.actorName, e.summary, e.target.label, e.action].some((x) => x.toLowerCase().includes(s))));
    const areas = [...new Set(db.audit.map((e) => e.action.split('.')[0]))].sort();
    return { rows: rows.slice(0, 200), total: rows.length, areas };
  },
  csv(rows: AuditEntry[]) {
    return ['Time,Actor,Action,Target,Summary', ...rows.map((e) => [new Date(e.at).toISOString(), `"${e.actorName}"`, e.action, `"${e.target.label}"`, `"${e.summary.replace(/"/g, "'")}"`].join(','))].join('\n');
  },
};

export const flagsAdmin = {
  get(userId: string) {
    const { role } = adminGuard(userId, 'overview');
    return { flags: JSON.parse(JSON.stringify(db.flags)) as typeof db.flags, canEdit: ROLE_PERMS[role].includes('config.edit') };
  },
  save(userId: string, next: typeof db.flags, reason: string) {
    adminGuard(userId, 'config.edit');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Add a reason (kept in the audit log).', 'reason');
    if (next.maintenance.on && next.maintenance.message.trim().length < 10) throw new ApiError('message', 'Write the message users will see (10+ characters).', 'message');
    const before = JSON.parse(JSON.stringify(db.flags));
    const diffs: string[] = [];
    (['tutorSignups', 'marketplaceCheckout', 'liveClasses'] as const).forEach((k) => { if (before[k] !== next[k]) diffs.push(`${k} ${next[k] ? 'ON' : 'OFF'}`); });
    if (before.maintenance.on !== next.maintenance.on || before.maintenance.message !== next.maintenance.message) diffs.push(`maintenance banner ${next.maintenance.on ? 'ON' : 'OFF'}`);
    if (!diffs.length) throw new ApiError('none', 'Nothing changed.');
    db.flags = JSON.parse(JSON.stringify(next));
    audit(userId, 'flags.update', { kind: 'config', id: 'flags', label: 'Feature flags' }, `${diffs.join(', ')} · ${reason.trim()}`, before, next);
    persist();
  },
};

/* ───────────────────────── Playground ───────────────────────── */
import { CHALLENGES as PG_CHALLENGES, challengeOf as pgChallenge } from '@/playground/challenges';
import { PLAYGROUND_LIMITS as PG_LIM, ISSUE_TEXT as PG_ISSUE, validateProject as pgValidate, todayKey as pgToday, pointsOf as pgPoints, fromPiston, type PistonResp } from '@/playground/checks';
import { stackOf as pgStack } from '@/playground/stacks';
import type { PFile } from '@/playground/stacks';
import type { RunResult } from '@/playground/types';

type PgTransport = (req: { language: string; files: { name: string; code: string }[]; stdins: string[] }) => Promise<{ results: PistonResp[]; runsLeft?: number }>;
/** Real: POST supabase/functions/playground-run (Piston behind it). Preview: no code server → a clear "not connected" answer, nothing is charged. */
let pgTransport: PgTransport = async (req) => {
  const url = process.env.EXPO_PUBLIC_PLAYGROUND_URL;
  if (!url) throw new ApiError('no_server', 'The code server is not connected in this preview. Browser languages work now; Java, C, C++, Go, Rust and more run on thebodhin.com.');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }); // + Authorization: Bearer <session> once Supabase auth is wired
  const j = await r.json();
  if (!r.ok) throw new ApiError(r.status === 429 ? 'quota' : 'server', j.error ?? 'Could not run right now.');
  return j;
};

export const playground = {
  /** Test hook: swap the code-server transport. */
  setTransport(t: PgTransport) {
    pgTransport = t;
  },

  overview(userId: string) {
    const solved = db.playgroundSolved.filter((x) => x.userId === userId).map((x) => x.challengeId);
    const used = db.playgroundUsage[`${userId}:${pgToday()}`] ?? 0;
    return {
      solved,
      points: pgPoints(solved, PG_CHALLENGES),
      projects: db.playgroundProjects.filter((p) => p.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      runsLeft: Math.max(0, PG_LIM.remoteRunsPerDay - used),
    };
  },

  save(userId: string, input: { id?: string; stack: string; title: string; files: PFile[] }) {
    if (!pgStack(input.stack)) throw new ApiError('bad_stack', 'Unknown stack.');
    const title = input.title.trim().slice(0, 80);
    if (!title) throw new ApiError('invalid', 'Give your project a name.');
    const issue = pgValidate(input.files);
    if (issue) throw new ApiError('invalid', PG_ISSUE[issue]);
    const mine = db.playgroundProjects.filter((p) => p.userId === userId);
    const existing = input.id ? mine.find((p) => p.id === input.id) : undefined;
    if (input.id && !existing) throw new ApiError('not_found', 'Project not found.');
    if (!existing && mine.length >= PG_LIM.savedProjects) throw new ApiError('limit', `You can keep up to ${PG_LIM.savedProjects} saved projects. Delete one to save a new one.`);
    const now = new Date().toISOString();
    if (existing) Object.assign(existing, { title, files: input.files, updatedAt: now });
    else db.playgroundProjects.push({ id: uid('pg'), userId, stack: input.stack, title, files: input.files, updatedAt: now });
    persist();
    return (existing ?? db.playgroundProjects[db.playgroundProjects.length - 1]).id;
  },

  remove(userId: string, id: string) {
    const i = db.playgroundProjects.findIndex((p) => p.id === id && p.userId === userId);
    if (i < 0) throw new ApiError('not_found', 'Project not found.');
    db.playgroundProjects.splice(i, 1);
    persist();
  },

  markSolved(userId: string, challengeId: string) {
    if (!pgChallenge(challengeId)) throw new ApiError('not_found', 'Unknown challenge.');
    if (!db.playgroundSolved.some((x) => x.userId === userId && x.challengeId === challengeId)) {
      db.playgroundSolved.push({ userId, challengeId, at: new Date().toISOString() });
      persist();
    }
  },

  /** Server-side run for compiled languages. 1 unit for a run, 2 for a multi-test check. Quota is spent before the code server is called. */
  async runRemote(userId: string, stackId: string, files: PFile[], stdins: string[]): Promise<RunResult[]> {
    const stack = pgStack(stackId);
    if (!stack || stack.runner !== 'remote' || !stack.piston) throw new ApiError('bad_stack', 'This language does not run on the server.');
    const issue = stdins.reduce<ReturnType<typeof pgValidate>>((acc, s) => acc ?? pgValidate(files, s), null);
    if (issue) throw new ApiError('invalid', PG_ISSUE[issue]);
    if (stdins.length < 1 || stdins.length > 5) throw new ApiError('invalid', 'Too many tests in one go.');
    const units = stdins.length > 1 ? 2 : 1;
    const key = `${userId}:${pgToday()}`;
    const used = db.playgroundUsage[key] ?? 0;
    if (used + units > PG_LIM.remoteRunsPerDay) throw new ApiError('quota', `You have used today’s ${PG_LIM.remoteRunsPerDay} server runs. Browser languages (HTML/CSS/JS, JavaScript, TypeScript, React, Python, SQL) are unlimited — or come back tomorrow.`);
    const t0 = Date.now();
    db.playgroundUsage[key] = used + units; // like the real function: spent BEFORE the code server is contacted (so floods cost nothing)
    let res: Awaited<ReturnType<PgTransport>>;
    try {
      res = await pgTransport({ language: stack.piston, files: files.map((f) => ({ name: f.name, code: f.code })), stdins });
    } catch (e) {
      if ((e as ApiError).code === 'no_server') db.playgroundUsage[key] = used; // nothing ran → nothing charged (preview only)
      persist();
      throw e;
    }
    persist();
    const left = Math.max(0, PG_LIM.remoteRunsPerDay - db.playgroundUsage[key]);
    return res.results.map((r) => {
      const o = fromPiston(r);
      return { stdout: o.stdout, stderr: o.stderr, ok: o.ok, ms: Date.now() - t0, phase: o.phase, runsLeft: left };
    });
  },
};
