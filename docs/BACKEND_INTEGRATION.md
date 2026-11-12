# Bodhin — Backend Integration Guide

For the developer connecting the app (students + educators) to real services. **Rule: screens never change.**
Replace the body of each function in `apps/student/src/api/client.ts` with a call to your API, keep the
function names, inputs and return shapes. Then delete `mockDb.ts`, `catalogSeed.ts`, `assessSeed.ts` and `batchSeed.ts`.
Every permission check that the mock does in `client.ts` (owner vs tutor, assigned courses, plan features, limits) **must also run on the server**.

Recommended stack (scales, fast, low ops for a small team):
**Postgres (Supabase or managed RDS) · Node/NestJS or Supabase Edge Functions · Cloudflare Stream or Bunny Stream
for video · LiveKit Cloud/self-hosted for live · Razorpay (Route for split settlements) · MSG91 for OTP · Expo
Notifications.** Next.js web app reuses `src/core/*` unchanged (move it to `packages/core`).

---

## 1. Non-negotiable security (from the architecture blueprint)

1. **Resolve the tenant on the server** from the request host (subdomain or verified custom domain). Never trust a tenant id from the client.
2. Every query is scoped by `tenant_id` **and** checked against the user's membership/enrolment. Use Postgres Row-Level Security.
3. Quiz questions are served **without** `correct` / `explanation`; scoring happens server-side in `submit`.
4. Video, recordings, PDFs and downloads use **short-lived signed URLs** issued only to enrolled users.
5. Payment success is decided by **server-verified signature + webhook**, never by the app.
6. Conferencing secrets stay on the server; the app only receives a per-user room token (host token only for owner/assigned tutor).
7. Gateway API secrets (tutor's Razorpay/Cashfree keys) are encrypted at rest (KMS) and never returned to any client.
8. Owner-only endpoints (earnings, subscription, payments, team, workspace, coupons) reject the `tutor` role.

## 2. Database tables (minimum)

```
users(id, name, email unique, phone unique, phone_verified, password_hash, created_at)
tenants(id, slug unique, custom_domain unique null, status, plan_id, branding jsonb, owner_user_id, created_at)
tenant_subscriptions(tenant_id, plan_id, status, billing, period_end, pending jsonb, addons jsonb, overrides jsonb)
tenant_payments(tenant_id, direct_gateway, gateway_status, gateway_keys_encrypted, payout_bank jsonb, gstin)
tenant_domains(tenant_id, host unique, status[pending_dns|verifying|active], verify_token, added_at)
platform_config(key, value)          -- commission_rate, gateway_fee_rate, refund_hold_days, payout_weekday, trial_days…
invoices(id, tenant_id, no, at, description, amount_inr, status)             -- Bodhin → tutor subscription invoices
plan_catalog(plan_id, monthly_inr, annual_inr, limits jsonb, features text[], custom_domain, recommended, best_for, updated_by, updated_at)
addon_catalog(kind, label, unit, monthly_inr)
config_history(id, at, by, area, label, changes jsonb, reason)                -- plan / add-on / platform rule edits
tenant_subscriptions.price_lock jsonb                                         -- old price kept until renewal after a rise
tenant_notes(id, tenant_id, text, by, at)
payout_runs(id, date, status[approved|paid], lines jsonb, approved_by, approved_at, paid_at)
payout_holds(tenant_id, reason, by, at)
refund_requests(id, order_id, tenant_id, amount_inr, reason, status, decided_by, decided_at)
reports(id, kind[review|course|user], target_id, reason, detail, by, at, status, resolution)
audit_log(id, at, actor_id, action, target_kind, target_id, target_label, summary, before jsonb, after jsonb)  -- append-only
curation(featured text[], banners text[]) · categories(id, name, icon, hidden)
user_locks(user_id, reason, by, at) · broadcasts(id, at, by, audience, title, body, reached)
feature_flags(key, value jsonb)                                               -- tutorSignups, marketplaceCheckout, liveClasses, maintenance
team_invites(id, tenant_id, name, email, course_ids, token, sent_at)
tutor_assignments(user_id, course_id)
memberships(user_id, tenant_id, role[student|tutor|owner|super_admin])        -- PK (user_id, tenant_id)
educator_applications(id, user_id, status, notes, submitted_at, reviewed_at)
plans(id, name, monthly_inr, annual_inr, limits jsonb)                        -- seed from core/plans.ts
tenant_usage(tenant_id, period, active_students, storage_gb, live_hours)      -- 70/85/100% alerts
categories(id, name, icon)
tutors(id, tenant_id, user_id, headline, years, verified)
courses(id, tenant_id, tutor_id, title, subtitle, description, category_id, level, format,
        price_inr, compare_at_inr, offer_ends_at, visibility[private|public|public_promoted],
        moderation[pending|approved|rejected], certificate, art jsonb, published_at)
modules(id, course_id, position, title)
lessons(id, module_id, position, type[video|pdf|quiz], title, duration_sec, size_mb, is_preview, media_key)
enrollments(user_id, course_id, enrolled_at, valid_till, source, last_lesson_id, last_active_at)
lesson_progress(user_id, lesson_id, completed_at, position_sec)
orders(id, user_id, course_id, amount_inr, discount_inr, coupon, method, status, gateway_order_id,
       gateway_payment_id, invoice_no, source, channel[bodhin_own|tutor_direct|bodhin_marketplace],
       collector[bodhin|tutor], seller_tenant_id, commission_inr, gateway_fee_inr, educator_share_inr,
       payout_status[not_applicable|on_hold|scheduled|paid], payout_date, created_at)
payouts(id, tenant_id, date, amount_inr, order_ids, utr, status)
coupons(id, tenant_id, code, type[pct|flat], value, course_ids, max_uses, used, starts_at, ends_at, paused)
batches(id, tenant_id, course_id, name, code, type, instructor_ids, capacity, start_date, end_date, slots jsonb, enrollment jsonb, status)
batch_members(batch_id, person_id/user_id, status[active|on_hold|completed|pending], enrolled_at)
class_sessions(id, batch_id, no, title, topic, description, starts_at, ends_at, mode, status, instructor_id, settings jsonb, reminders int[])
batch_attendance(session_id, user_id, status[present|late|absent], note)
announcements(id, tenant_id, batch_id null, title, body, kind, pinned, status, send_at, audience, reached, by)
live_summaries(session_id, ended_at, duration_sec, peak, attended, total, text, takeaways, chapters, materials, qa, polls, recording_published, shared_at)
student_notes(id, tenant_id, user_id, text, by, at)
reviews(id, course_id, user_id unique per course, rating, text, tags text[], created_at)
live_sessions(id, course_id, title, starts_at, ends_at, room_name, recording_key)
live_reminders(user_id, session_id)    attendance(user_id, session_id, joined_at, minutes)
assessments(id, course_id, kind, title, lesson_id, batch_id null, status[draft|published], duration_min, marks, pass_pct,
            due_at, opens_at, settings jsonb, rubric jsonb, content jsonb, created_by, updated_at)
questions(id, assessment_id, position, text, options jsonb, correct, topic, hint, explanation)
attempts(id, user_id, assessment_id, answers jsonb, started_at, submitted_at, score_pct, marks, by_topic jsonb)
submissions(id, user_id, assessment_id, status, files jsonb, link, note, submitted_at, return_note, grade jsonb)
notes(id, user_id, lesson_id, at_sec, text)   questions_qa(id, lesson_id, user_id, text, answer jsonb)
downloads_licences(user_id, lesson_id, device_id, expires_at)
certificates(id public, user_id, course_id, title, program, issued_at, pdf_key)
notifications(id, user_id, kind, title, body, link jsonb, read, created_at)
tickets(id, user_id, category, subject, body, status, created_at) ticket_replies(...)
user_settings(user_id, push jsonb, wifi_only, quality, language)
```

## 3. Function → endpoint map

| client.ts | Endpoint | Notes |
|---|---|---|
| `auth.signIn` | `POST /auth/login` | returns JWT access + refresh; store in `expo-secure-store` (replace localStorage in `store/auth.tsx`) |
| `auth.signUp` / `verifySignupOtp` | `POST /auth/register`, `POST /auth/otp/verify` | tutor role creates `educator_applications` (submitted after OTP) |
| `auth.sendOtp` / `verifyResetOtp` / `resetPassword` | `POST /auth/otp`, `/auth/password/reset` | rate-limit OTP (3/10 min) |
| `auth.socialSignIn` | `POST /auth/oauth/{google,apple}` | Apple sign-in is mandatory on iOS if Google is offered |
| `tenants.resolve` | server middleware | client keeps it only for theming |
| `catalog.explore / search / get` | `GET /courses?…` | marketplace: `visibility<>'private' AND moderation='approved'` |
| `learning.home` | `GET /me/home` | one call for the Home tab |
| `reviews.list / submit` | `GET/PUT /courses/:id/reviews` | enrolled only |
| `commerce.quote` | `POST /checkout/quote` | GST-inclusive prices |
| `commerce.pay` | `POST /orders` → gateway SDK → `POST /orders/:id/verify` + webhook | webhook creates enrollment; record `source` for commission |
| `player.open` | `GET /lessons/:id/play` | returns signed HLS URL (TTL ≈ 1 h) |
| `player.savePosition / setComplete` | `PUT /me/progress/:lessonId` | debounce 5 s (already done in app) |
| `downloads.start` | `POST /lessons/:id/download-licence` | then `expo-file-system` resumable download |
| `liveTab.join` | `POST /live/:id/join` | returns LiveKit token; 10-min early window enforced |
| `assessments.start / submit` | `POST /assessments/:id/attempts`, `PUT …/submit` | score server-side |
| `assessments.saveSubmission` | `PUT /assignments/:id/submission` + presigned upload | enforce types/size server-side |
| `certificates.verify` | `GET /verify/:certId` (public) | also a public web page |
| `payments.list / emailInvoice` | `GET /me/orders`, `POST /orders/:id/invoice-email` | |
| `support.*`, `notifications.*`, `account.*` | `/support/tickets`, `/me/notifications`, `/me` | |

### Educator endpoints

| client.ts | Endpoint | Notes |
|---|---|---|
| `educator.context / dashboard` | `GET /edu/context`, `GET /edu/dashboard` | role, plan entitlements, usage report, attention list |
| `courseAdmin.*` | `/edu/courses` (+ `/modules`, `/lessons`, `/publish`, `/listing`, `/archive`) | public listing → moderation queue (Super Admin); uploads via presigned URL, block at 100% storage |
| `batchesApi.*`, `people.*`, `batchForm.*` | `/edu/batches`, `/edu/students` | invite consumes active-student limit; notify linked accounts |
| `liveAdmin.list / get / schedule / start / end / summary / shareSummary` | `/edu/live/...` | `schedule` checks clashes + live-hours limit; `start` issues host token + notifies; `end` writes attendance from join logs, adds usage, triggers recording processing |
| `studentBatchSessions` (+ `liveTab`) | `GET /me/live` | student sees course sessions + their batch classes |
| `assessAdmin.*` | `/edu/assessments` (+ `/questions`, `/publish`, `/results`) | publish notifies recipients; results aggregate attempts |
| `grading.queue / detail / grade / requestResubmit` | `/edu/submissions` | rubric scores clamp to max; notify student |
| `doubts.list / answer` | `/edu/doubts` | answer visible to all course students |
| `earningsApi.statement / statementCsv` | `GET /edu/earnings?period=&channel=` | from orders + payouts |
| `subscriptionApi.*` | `/edu/subscription` (+ `/plan`, `/addons`) | Razorpay Subscriptions; downgrade at period end; block if `planBlockers` |
| `paymentsSetup.*` | `/edu/payments/gateway`, `/edu/payments/bank`, `/edu/payments/tax` | test key with a ₹1 order; penny-drop bank verify |
| `teamApi.*` | `/edu/team` (+ `/invites`) | seat limit = plan + add-ons; removal reassigns batches |
| `workspaceApi.*` | `/edu/workspace` (+ `/slug`, `/domain`, `/domain/verify`) | slug uniqueness + reserved list; DNS CNAME `tenants.thebodhin.com` + TXT `bodhin-verify=<tenant>` |
| `couponsApi.*` + `commerce.quote` | `/edu/coupons`, `POST /checkout/quote` | validate state/dates/limit/course server-side; increment `used` in the payment webhook |

### Super Admin endpoints (all under `/admin/*`, staff role + permission checked server-side, 2FA claim required)

| client.ts | Endpoint | Permission |
|---|---|---|
| `admin.me / verify / overview / search / peek` | `/admin/me`, `/admin/2fa`, `/admin/overview`, `/admin/search` | overview |
| `approvals.*` | `/admin/applications`, `/admin/course-reviews`, `/admin/reports` | approvals.* |
| `tenantsAdmin.list / detail / ownerView / act` | `/admin/tenants`, `/admin/tenants/:id/actions` | tenants.view / tenants.manage |
| `settingsAdmin.*` | `/admin/plans`, `/admin/addons`, `/admin/platform-config` (+ impact preview) | plans.edit / config.edit |
| `money.payoutRun / hold / approveRun / releaseRun` | `/admin/payouts` | payouts.run |
| `money.refunds / decideRefund` | `/admin/refunds` | refunds |
| `money.billing / retryCharge / remind / report` | `/admin/billing`, `/admin/reports` | money.view |
| `contentAdmin.*` | `/admin/curation`, `/admin/categories` (Bodhin courses use the normal course endpoints with tenant = Bodhin) | content.bodhin |
| `usersAdmin.*`, `ticketsAdmin.*` | `/admin/users`, `/admin/tickets` | users.* / support.tickets |
| `broadcastAdmin.*`, `staffAdmin.*`, `auditAdmin.*`, `flagsAdmin.*` | `/admin/broadcasts`, `/admin/staff`, `/admin/audit`, `/admin/flags` | broadcast / admins.manage / audit.view / config.edit |
| `system.status` | `GET /status` (public, cached 60 s) | — |

Rules to keep on the server: at least one Super Admin always; staff can't lock themselves; payout run needs approve then release
(optionally a second approver); refunds of direct sales go to the educator's gateway, never Bodhin; plan price rises set
`price_lock` for existing subscriptions; kill switches are checked in sign-up, checkout and live endpoints.

**Business rules verified by the POC test suite (keep them on the server):**

- **Student limit at checkout:** a paid or free enrolment by a learner who is *new to that workspace* is refused when the workspace is at 100% of active students (marketplace and direct alike); learners already enrolled in that workspace can still buy more courses. The checkout shows the reason before payment and the owner gets one notification. Each new learner adds one active student.
- **Bodhin promo codes** (`BODHIN10`, `WELCOME5`…) are Bodhin-funded and valid **only on Bodhin's own courses**. Workspace coupons are valid only on that workspace's courses.
- **Suspended workspace:** no new paid or free enrolments; existing learners keep access.
- **Payout run:** an order is due when `payout_date` falls on or before the run day (compare instants in IST, not UTC date strings). Orders with an open refund request are left out of the run (not deducted twice) until the refund is decided; release marks exactly the order IDs that were approved.
- **Price lock:** stored with its `plan`; applies only while the tenant stays on that plan; the tenant pays the lower of lock and catalogue; a second rise keeps the original price with a fresh 30-day notice; manual "mark paid" and retries charge the locked price.
- **Downgrade check** counts the add-ons the tenant keeps, and blocks while a custom domain is connected without the feature or add-on. The custom-domain add-on can't be removed while a domain is connected.
- **Custom domain** host is unique across workspaces. "Hide Powered by Bodhin" needs white-label.
- **Owner actions are tenant-scoped** (coupons, invites, tutor course assignment, tutor removal) — never act on an ID from another workspace.
- **Educator application:** sign-up + OTP creates only a *draft*. The tutor completes the academy form (name, subjects, experience, city, planned students, sample link, ID check) → *submitted* → only then it appears in the Super Admin inbox. "Changes requested" lets the tutor edit and resubmit.
- **Each approved academy gets its own instructor profile** (name, subjects headline, experience); its courses never borrow another tutor's profile.
- **Course edits can't set** moderation, rating, rating count, students, tenant or `published` status — publishing goes through the checklist. Changing the title or price of an approved public listing sends it back to review.
- **Publish checklist follows the sales channel:** own-site sales need the tutor's gateway; a marketplace listing needs a verified payout bank account and at least 3 lessons (the same bar Bodhin's reviewers use).
- **Refunds:** learners request within the refund window (7 days, with a reason). Bodhin Finance decides refunds on money Bodhin collected (own + marketplace); the **academy owner decides refunds on its direct sales** (notified, handled in Earnings). An approved refund removes access and notifies the learner.
- **Receipts:** every purchase notifies the buyer (invoice no.) and the academy owner (new enrolment).
- **Platform config** is validated on the server (commission 0–50%, gateway fee 0–5%, refund hold 0–30 days, trial 0–60 days on a priced plan, payout weekday 0–6); `bodhin_tenant_id` can never be changed from the portal. A new commission rate applies to new sales only.

## 4. Payment routing, commission & payouts

- **Whoever hosts the checkout collects** — `core/business.ts › paymentRoute(courseTenantId, checkoutTenantId)`:
  - Bodhin's own course (`tenant = platform_config.bodhin_tenant_id`) → `bodhin_own`, Bodhin keeps 100%.
  - Tutor's course on the tutor's subdomain / custom domain / private link → `tutor_direct`, paid into the **tutor's own
    Razorpay/Cashfree account** (their keys), Bodhin 0%. If the tutor's gateway is not active, block checkout (`seller_not_ready`).
  - Tutor's course bought on thebodhin.com → `bodhin_marketplace`, Bodhin collects; `splitOrder` = commission 20% + gateway fee 2%,
    rest is the educator share.
- Payout: `payoutDateFor` = first payout weekday after the refund hold (7 days). Weekly batch job: mark `on_hold → scheduled → paid`,
  transfer via RazorpayX/Route, store UTR. Reverse commission and share on refunds before payout.
- Coupons: commission is computed on the **discounted** price.
- Tutors pay Bodhin separately for their plan (Starter–Enterprise, monthly/annual) and add-ons (`ADDON_CATALOG`).
- Keep the 30-day attribution window (`attributionDays`) for marketplace referrals that later buy on the tutor's domain if the client
  confirms that rule; today the checkout host decides.
- Confirm merchant-of-record, GST invoicing (Bodhin invoices marketplace buyers; tutor invoices direct buyers) and TDS/TCS with a CA before launch.

## 4b. Plans, limits & usage policy

- Plan limits: `core/plans.ts › PLANS`; features per plan: `core/business.ts › PLAN_FEATURES`; effective limits = plan + add-ons + Super Admin overrides (`entitlements`).
- Usage (`tenant_usage`): active students, video storage GB, live room-hours (monthly reset), tutor seats.
- Alerts at **70% / 85%**; at **100%** block only *new* enrolments / uploads / scheduling / invites. Never delete content, never cut a running live class.
- Every limit check in `client.ts` (`consumeStudentSeat`, `courseAdmin.canUpload`, `liveAdmin.schedule`, `teamApi.invite`, `subscriptionApi.changePlan`) must be repeated server-side.

## 4c. Super Admin owns the business rules

`platform_config`, plan catalogue, add-on prices, per-tenant overrides, moderation, payouts, refunds and flags are all edited
from the Super Admin portal; the educator and student apps only read them. (`courseAdmin.demoReview` in the course builder is a
single-login demo shortcut — remove it when the portal is live.)

## 5. Swapping simulated pieces

- **Video:** `src/ui/VideoSurface.tsx` — replace the clock with `useVideoPlayer(streamUrl)` + `<VideoView>` from `expo-video`; keep the props.
- **Host room:** `src/app/edu/host/[id].tsx` — swap the simulated classroom effect for LiveKit room events (participants, data messages for chat/Q&A/polls/hands/whiteboard strokes); screen share via LiveKit `setScreenShareEnabled`; recording via LiveKit Egress → storage, chapters from host bookmarks.
- **Live:** `src/app/live-room/[id].tsx` — the UI is provider-agnostic. LiveKit: `@livekit/react-native` with the token from `liveTab.join`. BigBlueButton cannot render this custom UI; open its join URL in a WebView instead.
- **Downloads:** `downloads.start` — `FileSystem.createDownloadResumable`, store under app documents, check licence expiry before offline playback.
- **Push:** register Expo push token after login; send for live start (−15 min), grades, Q&A answers, payments.
- **Calendar sync:** `expo-calendar` creates events for `live_reminders`.
- **File picker:** already real (`expo-document-picker`); upload to a presigned URL.

## 6. Release checklist

- [ ] Typecheck clean, test on a 360px Android phone and an iPhone
- [ ] Cross-tenant access test: tenant A cannot read tenant B data (API + media)
- [ ] Payment success, failure, refund and webhook replay tested
- [ ] Private videos reject unauthorised requests
- [ ] OTP rate limits; account lockout after repeated failures
- [ ] Tutor role cannot reach owner endpoints; tutor sees only assigned courses/batches
- [ ] Direct sale lands in the tutor's gateway; marketplace sale split + payout run end to end
- [ ] Limit enforcement at 100% (students, storage, live hours, seats) on the server
- [ ] Custom domain DNS verify + TLS issuance on a real domain
- [ ] Admin portal: 2FA enforced, every endpoint permission-checked, audit log append-only, admin host not reachable from tenant domains
- [ ] Payout run end to end on RazorpayX test mode (hold, approve, release, failure)
- [ ] Store listing: privacy policy, data-safety form, Apple sign-in, permissions text (already in `app.json`)
