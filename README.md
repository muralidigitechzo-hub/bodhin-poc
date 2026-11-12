# Bodhin — App POC (Students + Educators)

**Bodhin** (thebodhin.com) is a multi-tenant LMS: educators join Bodhin, get their own workspace
(`tutorname.thebodhin.com` or a custom domain), and sell or privately run courses. Learners use one
app on **iOS, Android and web**. **Students and educators use the same app — only the login (role) differs.**
Every student and educator screen is built and working end to end on **mock data**, so the developer only has
to plug in the real backend. (The folder is still called `apps/student`; it now contains both areas.)

> Built by Digitechzo. Business rules come from *Bodhin – Client Proposal, Pricing & Marketplace Strategy*
> and *Bodhin – LMS Architecture Blueprint v1.1*.

---

## 1. Run it in 2 minutes

Requirements: Node 20+ and npm. No database, no keys.

```bash
cd apps/student
npm install
npx expo start          # press w = web, or scan the QR with the Expo Go app on your phone
```

Demo logins (password **demo123** for all):

| Login | Role | Lands on |
|---|---|---|
| `arjun@demo.in` | Student (in batch DM-OCT-02) | Student Home |
| `rajesh@demo.in` | Owner of *Rajesh Kumar Academy* (Institute, annual, custom domain, Razorpay live) | Educator dashboard |
| `meera@demo.in` | Tutor in Rajesh's academy (2 assigned courses) | Educator dashboard (limited) |
| `admin@demo.in` | Bodhin **Super Admin** (web portal, 2-step code **123456**) | Command Center |
| `finance@demo.in` · `moderator@demo.in` · `support@demo.in` | Bodhin staff with limited roles | Command Center (role-filtered) |
| `ramya.apply@demo.in` (and 5 more) | Educator applicants waiting in the Approvals inbox | Learner Home until approved |

OTP in every flow: **123456** · Coupons: **BODHIN10** (Bodhin-wide), **DIWALI25** (Rajesh's workspace) · Failing card: `4000 0000 0000 0002`.
Owners/tutors can switch to the learner view from *More → Switch to learner view* (and back from *Profile*).
Reset demo data: clear the browser's localStorage (key `bodhin.mockdb.v24`).

Try a tutor workspace (white-label branding) on web: add `?tenant=rajesh` to the URL.

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check (must stay clean) |
| `bash tests/business/run.sh` | 600+ checks: business rules, live-room protocol + branding scan, Playground (reference solutions really executed) —  earlier: 224 business-rule checks (money split, payouts, plans, price lock, roles, kill switches, educator journey, refunds, admin ops) against `client.ts` — run after every change; keep them as server tests later |
| `tests/e2e/*.py` | Browser journeys (Playwright): tutor sign-up → admin approval, learner purchase → refund, pricing & limits — see `tests/e2e/README.md` |
| `npm run export:web` | Static web build into `dist/` |
| `node scripts/inline-web.mjs dist preview/bodhin-preview.html` | One-file shareable preview |
| `npx eas-cli@latest build -p android --profile preview` | Installable Android APK |
| `npx eas-cli@latest build -p ios --profile production` | iOS build for TestFlight |

One codebase → iOS + Android + web (Expo SDK 58, React Native 0.88, Expo Router, TypeScript strict).

---

## 2. Folder structure

```
apps/student/
  src/app/          Screens (Expo Router: every file is a route)
    (auth)/         splash → onboarding → sign-in / sign-up → OTP → forgot password → tutor application status
    (tabs)/         Home · Explore · My Learning · Live · Profile  (bottom bar on phones, side rail ≥ 900px)
    course/[id]     Course page (detail + curriculum + live + reviews, enrolled / not enrolled)
    checkout/[id]   Checkout (UPI / card / netbanking, coupon, GST, success)
    learn/[id]      Lesson player (video / PDF / quiz lessons, notes, Q&A, downloads)
    live-room/[id]  Live class room (+ ?mode=recording for past sessions)
    quiz/[id]       Quiz / exam attempt     result/[id]  Quiz result
    assignment/[id] Assignment details, submission, feedback
    search, downloads, payments, certificates, help, notifications
    educator/       Educator tabs: Home (dashboard) · Courses · Batches · Live · More
    edu/            Educator screens:
      course/[id]     4-step course builder (details → curriculum → pricing & listing → publish)
      lesson          Lesson editor (video / PDF upload, quiz → assessment builder)
      batch-new, batch/[id]   Batches: overview · students · schedule · attendance · updates
      student/[id]    Student profile (progress, attendance, notes, message)
      schedule        Schedule live class   prejoin/[id] Pre-join check   host/[id] Host live room
      summary/[id]    Class summary & recording (chapters, attendance, Q&A, share)
      assess/         Quizzes, exams, assignments: hub · new · [id] builder (setup, questions/rubric, results)
      grading, grade/[id]   Grading queue + rubric grading      doubts   Doubts inbox
      earnings, subscription, payments-setup, team, workspace, coupons   Business & workspace settings
    admin/          Super Admin portal (web only — admin.thebodhin.com; 2-step gate in admin/_layout)
      (tabs)/         Home (Command Center) · Inbox (approvals) · Tenants · Money · More
      review/[kind]/[id]   Educator application / course listing review (phone)
      tenant/[id]     Workspace 360 + actions        search   Global search with quick-look
      plans, plan/[id], settings   Plans & limits editor, platform rules (commission, fees, payouts, trial)
      content         Bodhin's own courses, marketplace curation (hero, featured), categories
      users, user/[id], tickets, broadcast, team, audit, flags
  src/core/         Pure TypeScript business rules — NO React. Move to packages/core for the web app.
    plans.ts        Subscription plans, usage alerts (70/85/100%)
    business.ts     ★ Payment routing (who collects), order split, payouts, plan entitlements, add-ons, usage report
    batch.ts        Batches, class sessions, attendance, announcements, live summaries
    admin.ts        Staff roles (super_admin, finance, moderator, support), permissions, audit entry type
    catalog.ts      Course model, progress, pricing display, search/filter/sort, orders, reviews
    assess.ts       Quizzes, exams, assignments, scoring
    tenant.ts       Host → tenant resolution (subdomain / custom domain)
    validate.ts, time.ts, types.ts
  src/api/
    client.ts       ★ THE ONLY DATA LAYER. Screens call only these functions.
    mockDb.ts       In-memory demo DB (persisted to localStorage on web). Delete when live.
    catalogSeed.ts, assessSeed.ts, batchSeed.ts, adminSeed.ts   Demo content (adminSeed: 9 extra workspaces, applicants, reports, refunds, audit).
  src/theme/        Design tokens + tenant-branded theme provider
  src/ui/           Shared components (Button, TextField, BottomSheet, VideoSurface, cards…)
  src/store/        Session store
```

## 3. UX rules used everywhere (keep them)

- **Thumb-first:** primary actions live in a bar pinned to the bottom (Enroll, Continue, Next, Submit, Pay).
  Filters, options and confirmations open as **bottom sheets**, never top menus.
- **Fixed 5-tab nav:** students — Home · Explore · My Learning · Live · Profile; educators — Home · Courses · Batches · Live · More.
- Touch targets ≥ 48px (primary 54px). Every control has an accessibility label.
- Honest pricing: a strike-through price shows only for a real, dated offer (pricing doc rule).

### Responsive layout (one codebase, three layouts) — `src/ui/responsive.tsx`

| Width | Layout |
| --- | --- |
| Phone < 768px | Thumb-first: bottom tab bar, pinned action bars, bottom sheets (the rules above) |
| Tablet 768–1023px | Icon side rail, centred content |
| Desktop ≥ 1024px | **Persistent left sidebar on every page** (logo, labelled nav, account, learner ↔ educator switch) via `DesktopFrame` in the root layout; wide pages (up to 1200px) with grids; course page and checkout in two columns (sticky buy/summary card); player with course outline panel; course editor with a vertical step list; primary actions inline or in the page header (no pinned bars, no floating buttons); bottom sheets open as centred dialogs; sign-in/up with a brand panel |

Helpers: `useLayout()` (isPhone / isTablet / isDesktop, `cols()`), `Grid`, `Cols`, `PAGE` widths. Full-screen on desktop (no sidebar): sign-in flow, video player, live rooms. When adding a screen: build the phone layout first, then add the desktop arrangement with `isDesktop` — never change the phone layout for desktop.

## 4. Tenants & branding

`ThemeProvider` resolves the tenant from the hostname (`core/tenant.ts`) and swaps colours, logo and name.
`thebodhin.com` = marketplace (only public, approved courses). `rajesh.thebodhin.com` or `learn.rajeshacademy.in`
= that tutor's workspace (their courses, including private ones). **The server must resolve and enforce the tenant;
the client value is only for theming.**

## 5. Educator area — what's in it

| Area | Screens | Key rules |
|---|---|---|
| Dashboard | `educator/home` | workspace card, trial/usage banners, live card, KPIs, *Needs attention* (grade, doubts, review, low attendance), earnings split, activity, Create sheet |
| Courses | `educator/courses`, `edu/course/[id]`, `edu/lesson` | draft → published → archived; private publishes instantly, public listing goes to Bodhin review; strike price needs an offer end date; uploads blocked at 100% storage |
| Batches & students | `educator/batches`, `edu/batch-new`, `edu/batch/[id]`, `edu/student/[id]` | weekly slots generate sessions; approval queue; attendance (manual / import from live); announcements; invite consumes active-student limit |
| Live classes | `educator/live`, `edu/schedule`, `edu/prejoin/[id]`, `edu/host/[id]`, `edu/summary/[id]` | same-batch clash check; live room-hours limit blocks *new* classes only; ending a class auto-marks attendance, adds live hours, creates summary; students see batch classes in their Live tab |
| Assessments | `edu/assess/*`, `edu/grading`, `edu/grade/[id]`, `edu/doubts` | drafts hidden from students; batch-targeted assessments; attempt limits; rubric grading; resubmission requests; answers notify the student |
| Business (owner only) | `edu/earnings`, `edu/subscription`, `edu/payments-setup`, `edu/team`, `edu/workspace`, `edu/coupons` | see *Payment rules* below; downgrade blocked while usage exceeds the target plan; seat-limited tutor invites; custom domain DNS → verify → SSL; dated coupons only |

**Roles:** *owner* sees everything in their workspace. *tutor* sees only assigned courses (and batches where they
instruct); no earnings, plan, payments, team, branding or coupons. Enforce the same on the server.

### Payment rules (agreed with the client)

| Sale | Who collects | Bodhin keeps | Tutor gets |
|---|---|---|---|
| Bodhin's own course (posted by Super Admin) | Bodhin | 100% | — |
| Tutor's course bought on the tutor's subdomain / custom domain / private link | **Tutor's own gateway** | 0% | 100% directly |
| Tutor's course bought on thebodhin.com (marketplace) | Bodhin | 20% commission + 2% gateway fee | rest, paid weekly (Monday) after a 7-day refund hold |
| Tutor subscription (Starter → Enterprise) + add-ons | Bodhin | 100% | — |

Rule of thumb: **whoever hosts the checkout page collects the money** (`core/business.ts › paymentRoute`).
All numbers (commission, fee, hold days, payout day, trial) live in `PlatformConfig` and will be edited by Super Admin.

### Super Admin portal

Web portal only (no app-store build). On phones it behaves like an app (bottom tabs, bottom sheets; "Add to Home Screen");
on laptops it shows a side rail and list + detail side by side. Every screen is at most two taps from the Command Center.

| Module | What it controls |
|---|---|
| Command Center | Bodhin revenue (subscriptions + commission + own courses) with month-end pace, GMV split by who collected, "Needs you" tiles, alerts (payment failed, trial ending, usage ≥85/100%, no gateway/bank, DNS pending), admin activity, live platform rules; global search (`/` on web) with quick-look |
| Inbox | Educator applications (approve → workspace + trial; reject / ask for changes), course listing reviews (automatic checks, promotion toggle), reported reviews/courses/users; bulk approve only for items passing all checks |
| Tenants | Filters, sort, Workspace 360 (overview, plan & limits, money, courses & team, notes & audit, read-only owner view) and actions: change plan (now / at renewal), extend trial, record offline payment, add-ons (billed or complimentary), feature/limit overrides, message owner, suspend/reactivate |
| Plans & rules | Plan prices/limits/features, add-on prices, commission %, gateway fee, refund hold, payout day, referral window, trial plan/length — with impact preview and change history. Price rises: new sign-ups at once, existing workspaces keep the old price until renewal (≥30 days' notice, automatic) |
| Money | Weekly payout run (hold a workspace → approve → release, UTRs, CSV), refunds with commission reversal by channel, subscription billing (retry, reminders, trials, renewals, invoices), revenue reports |
| Content & control | Bodhin's own courses (same builder, no review), hero banners & featured order on Explore, categories, Bodhin coupons, users 360 (lock, reset, verify phone, give/remove access), support tickets, broadcast, admin team & role matrix, append-only audit log, kill switches (educator sign-ups, marketplace checkout, live classes) and maintenance banner |

Roles: **Super Admin** everything · **Finance** money, payouts, refunds, audit · **Moderator** approvals, Bodhin content · **Support** users & tickets.
Every admin action requires a reason where it changes money, plans or access, and is written to the audit log with before → after.

## 6. What is simulated in the POC

| Feature | POC | Production (see docs/BACKEND_INTEGRATION.md) |
|---|---|---|
| Data | `mockDb.ts` | Postgres + API |
| OTP / social login | code 123456, demo account | SMS/email OTP provider, Google & Apple OAuth |
| Payments | `commerce.pay()` waits and succeeds | Razorpay/Cashfree order + server signature check + webhook |
| Video | `VideoSurface` runs a clock over course art | `expo-video` + signed HLS URL |
| Downloads | progress simulation | `expo-file-system` encrypted, licence-bound files |
| Live room (student + host) | scripted chat/Q&A/polls/hands, simulated camera | **Built:** self-hosted LiveKit (Apache-2.0), headless SDK + Bodhin's own UI → no third-party branding or watermark. Needs a LiveKit server + `live-token` function — `docs/LIVE_CLASSES.md` |
| Whiteboard | local SVG strokes | strokes already broadcast over the data channel (`protocol.ts`) |
| Code Playground | browser stacks run for real (JS, TS, Python, SQL, HTML/CSS/JS, React); server stacks (Java, C, C++, Go, Rust, PHP, Ruby, C#, Kotlin) say "code server not connected" | Piston behind the `playground-run` function — `docs/PLAYGROUND.md` |
| Gateway connect / bank verify | format checks + instant success | Razorpay/Cashfree key test, penny-drop API |
| Custom domain | instant verify (any host containing `fail` fails) | DNS check + Cloudflare for SaaS / Caddy on-demand TLS |
| Plan / add-on purchase | invoice created instantly | Razorpay Subscriptions + GST invoice |
| Admin 2-step sign-in | fixed code 123456, 12 h | TOTP (authenticator app) or SMS OTP, session claim |
| Payout release | instant success with generated UTRs | RazorpayX payouts API + webhook for UTR/failure |
| Broadcast email | in-app notification only | email provider (SES / SendGrid) + in-app |
| Push / calendar | stored settings | Expo Notifications + `expo-calendar` |
| Certificate PDF | on-screen card | server-rendered PDF from the same layout |

## 7. Definition of done for each screen

Every screen has loading, empty, error and success states, validation messages that say how to fix the
problem, and works at 360px phone width up to laptop width. `npm run typecheck` passes.
