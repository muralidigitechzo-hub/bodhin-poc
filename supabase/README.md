# Bodhin — Supabase database (Phase 1)

Phase 1 = web app, Bodhin's own courses + tutor direct sales + marketplace orders, educator approval, Super Admin basics.
Everything here was tested on Postgres 16 with a Supabase stand-in: **95 database checks pass** (`tests/db_test.py`).

## Files

| File | What it is |
| --- | --- |
| `bodhin_setup_all.sql` | **The one file to paste.** = migrations 0001–0003 + seed + 0004, in order |
| `migrations/0001_tables.sql` | All tables (money in paise) |
| `migrations/0002_rules.sql` | Business rules as functions: payment routing, quote, coupons, student limits, orders, invoices, payout dates, approvals, kill switches, audit |
| `migrations/0003_security.sql` | Row-Level Security: who can see / change what |
| `migrations/0004_refunds_and_listing.sql` | Refund decisions (Finance for Bodhin-collected sales, the academy for direct sales) + marketplace listing quality bar. **If you already ran an older setup file, run only this one.** |
| `seed.sql` | Plans, add-ons, staff permissions, categories, Bodhin workspace, BODHIN10 / WELCOME5, Bodhin's courses |
| `tests/db_test.py` | 95 checks: learners, tutors, finance, moderator, admin acting on real rows |

## Setup in 5 minutes (no coding)

1. Open your project on supabase.com → left menu **SQL Editor** → **New query**.
2. Open `bodhin_setup_all.sql`, select all, copy, paste into the editor.
3. Click **Run** (bottom right). Wait for "Success. No rows returned".
4. Left menu **Table Editor** → you should see `plans`, `courses`, `tenants`… with a 🔒 (security on).
5. Make yourself Super Admin:
   - **Authentication → Users → Add user → Create new user** → your email + a strong password → tick "Auto confirm".
   - SQL Editor → new query → run (change the email):
     ```sql
     update public.profiles set staff_role = 'super_admin', name = 'Guru Vishwa' where email = 'your@email.com';
     ```
6. Run it **once** per new project. To start over, create a fresh project (don't run it twice on the same one).

## Rules the database enforces (the app can't bypass them)

- **Who collects:** Bodhin course → Bodhin 100%. Tutor's own site → tutor's gateway, 0% to Bodhin. Tutor course on thebodhin.com → Bodhin collects, keeps commission (20%) + gateway fee (2%), pays the tutor after a 7-day hold on Monday 10:00 IST.
- Orders and enrolments are written only by `create_order()` / `mark_order_paid()` (called by the payment Edge Function with the service key) and `enroll_free()`. A repeated webhook does nothing.
- Invoice numbers: `BOD/2627/00001` for Bodhin; `<TUTOR>/2627/00001` per tutor (own counter each), max 16 characters.
- Coupons belong to one workspace and work only on its courses; Bodhin promo codes only on Bodhin courses. Coupons need Creator plan+.
- Student limit: new learners can't enrol at 100%; existing learners can still buy. Suspended workspace: no new enrolments.
- Public listing → review by a Moderator; educators can't approve themselves or fake ratings.
- "Hide Powered by Bodhin" needs white-label. Workspaces can't change their slug, owner or status.
- Staff actions check the role (Super Admin / Finance / Moderator / Support), need a reason, and are written to an audit log nobody can edit or delete. Always at least one Super Admin.
- Gateway secrets live in `tenant_secrets`, readable only by the service key.

## Re-running the tests (developer)

```bash
# local Postgres 16 + the Supabase stand-in in tests/supabase_shim.sql, then:
python3 tests/db_test.py "host=localhost port=5432 user=postgres dbname=bodhin"
```

## Next (Phase 1 continues)

1. Edge Functions: `checkout` (Razorpay order on the right account), `razorpay-webhook` (verify → `mark_order_paid`), `connect-gateway` (verify tutor keys, store secret), `video-upload` / `video-play` (Cloudflare Stream signed URLs).
2. Swap `apps/student/src/api/client.ts` from mock data to Supabase (screens unchanged).
3. Deploy the web app (Cloudflare Pages / Vercel) on thebodhin.com.
