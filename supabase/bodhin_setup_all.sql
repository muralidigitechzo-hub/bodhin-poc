-- Bodhin Phase 1 — complete database setup (paste this whole file into Supabase → SQL Editor → Run).
-- Generated 2026-11-06. Contains: 0001_tables, 0002_rules, 0003_security, seed, 0004_refunds_and_listing. Run ONCE on a NEW project.
-- Already ran an older bodhin_setup_all.sql? Then run ONLY migrations/0004_refunds_and_listing.sql.

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0001 — tables
-- Money is stored in PAISE (bigint). ₹1 = 100 paise. Timestamps are UTC.
-- Run order: 0001_tables → 0002_rules → 0003_security → seed.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────── Platform settings (single row each) ───────────────
create table public.plans (
  id                text primary key check (id in ('starter','creator','growth','institute','enterprise')),
  name              text not null,
  monthly_paise     bigint,              -- null = custom quote
  annual_paise      bigint,
  active_students   int,                 -- null = unlimited
  storage_gb        int,
  live_hours        int,
  tutor_seats       int,
  features          text[] not null default '{}',
  recommended       boolean not null default false,
  best_for          text not null default '',
  sort              int not null default 0
);

create table public.addons (
  kind              text primary key check (kind in ('students','storage','live_hours','seats','custom_domain')),
  label             text not null,
  unit              text not null,
  monthly_paise     bigint not null,
  adds_students     int not null default 0,
  adds_storage_gb   int not null default 0,
  adds_live_hours   int not null default 0,
  adds_seats        int not null default 0,
  adds_feature      text
);

create table public.platform_config (
  id                int primary key default 1 check (id = 1),
  commission_rate   numeric(5,4) not null default 0.20 check (commission_rate between 0 and 0.5),
  gateway_fee_rate  numeric(5,4) not null default 0.02 check (gateway_fee_rate between 0 and 0.05),
  refund_hold_days  int not null default 7 check (refund_hold_days between 0 and 30),
  payout_weekday    int not null default 1 check (payout_weekday between 0 and 6),   -- 1 = Monday
  attribution_days  int not null default 30 check (attribution_days between 0 and 365),
  trial_days        int not null default 14 check (trial_days between 0 and 60),
  trial_plan        text not null default 'growth' references public.plans(id),
  bodhin_tenant_id  uuid,                                   -- set by seed; never editable from the portal
  gst_rate          numeric(5,4) not null default 0.18,
  updated_at        timestamptz not null default now()
);

create table public.feature_flags (
  id                    int primary key default 1 check (id = 1),
  tutor_signups         boolean not null default true,
  marketplace_checkout  boolean not null default true,
  live_classes          boolean not null default true,
  maintenance           boolean not null default false,
  maintenance_message   text not null default '',
  updated_at            timestamptz not null default now()
);

create table public.role_perms (
  role  text not null check (role in ('super_admin','finance','moderator','support')),
  perm  text not null,
  primary key (role, perm)
);

create table public.categories (
  id      text primary key,
  name    text not null,
  icon    text not null default 'book',
  hidden  boolean not null default false,
  sort    int not null default 0
);

-- ─────────────── People ───────────────
-- One row per Supabase Auth user (created automatically by a trigger in 0002).
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null default '',
  email           text not null default '',
  phone           text,
  phone_verified  boolean not null default false,
  avatar_url      text,
  staff_role      text check (staff_role in ('super_admin','finance','moderator','support')),
  locked          boolean not null default false,
  lock_reason     text,
  created_at      timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- ─────────────── Workspaces (tenants) ───────────────
create table public.tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,30}$'),
  status           text not null default 'active' check (status in ('active','suspended')),
  display_name     text not null,
  tagline          text,
  primary_color    text not null default '#0F3D63',
  primary_deep     text not null default '#0A2A45',
  accent           text not null default '#F2A93B',
  logo_url         text,
  hide_powered_by  boolean not null default false,
  owner_id         uuid references public.profiles(id),
  custom_domain    text unique,
  domain_status    text check (domain_status in ('pending_dns','verifying','active')),
  created_at       timestamptz not null default now()
);

create table public.reserved_slugs (slug text primary key);

create table public.tenant_subscriptions (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  plan         text not null references public.plans(id),
  status       text not null check (status in ('trialing','active','past_due','cancelled')),
  billing      text not null default 'monthly' check (billing in ('monthly','annual')),
  period_end   timestamptz not null,
  pending      jsonb,            -- {plan, billing, at} downgrade scheduled at period end
  price_lock   jsonb,            -- {plan, monthly_paise, annual_paise, until}
  addons       jsonb not null default '[]',   -- [{kind, qty}]
  overrides    jsonb,            -- {features:{x:true}, limits:{activeStudents:null}}
  updated_at   timestamptz not null default now()
);

-- Readable by the owner + Bodhin staff. Gateway SECRETS are never stored here (see tenant_secrets).
create table public.tenant_payment_settings (
  tenant_id               uuid primary key references public.tenants(id) on delete cascade,
  direct_gateway          text check (direct_gateway in ('razorpay','cashfree')),
  direct_gateway_status   text not null default 'not_connected' check (direct_gateway_status in ('not_connected','pending','active')),
  gateway_key_id          text,      -- public key id (rzp_live_xxx) — safe to show
  payout_bank             text,
  payout_last4            text,
  payout_verified         boolean not null default false,
  gstin                   text,
  pan_last4               text,
  updated_at              timestamptz not null default now()
);

-- Service role only (no policies at all). Encrypt values before storing (Supabase Vault or app-level).
create table public.tenant_secrets (
  tenant_id           uuid primary key references public.tenants(id) on delete cascade,
  gateway_key_secret  text,
  webhook_secret      text,
  updated_at          timestamptz not null default now()
);

create table public.tenant_usage (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  storage_mb    bigint not null default 0,
  live_minutes  int not null default 0,         -- this calendar month
  month         date not null default date_trunc('month', now())::date
);

create table public.memberships (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  role       text not null check (role in ('student','tutor','owner')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id, role)
);
create index memberships_tenant_idx on public.memberships (tenant_id, role);

create table public.educator_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft','submitted','under_review','approved','rejected','changes_requested')),
  workspace_name   text,
  slug             text,
  subjects         text[] not null default '{}',
  experience_years int,
  city             text,
  planned_students int,
  sample_url       text,
  id_verified      boolean not null default false,
  note             text,
  tenant_id        uuid references public.tenants(id),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create unique index one_open_application on public.educator_applications (user_id) where status in ('draft','submitted','under_review','changes_requested');

-- ─────────────── Courses ───────────────
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  tutor_id         uuid references public.profiles(id),
  title            text not null check (length(title) between 3 and 120),
  subtitle         text not null default '',
  description      text not null default '',
  category_id      text references public.categories(id),
  collections      text[] not null default '{}',
  level            text not null default 'all' check (level in ('beginner','intermediate','advanced','all')),
  format           text not null default 'recorded' check (format in ('live','recorded','hybrid')),
  language         text not null default 'English',
  price_paise      bigint not null default 0 check (price_paise >= 0),
  compare_at_paise bigint check (compare_at_paise is null or compare_at_paise > price_paise),
  offer_ends_at    timestamptz,
  access_months    int,                               -- null = lifetime
  certificate      boolean not null default true,
  outcomes         text[] not null default '{}',
  art              jsonb not null default '{"from":"#0F3D63","to":"#1E6FA8","icon":"book"}',
  badge            text check (badge in ('bestseller','new','trending')),
  status           text not null default 'draft' check (status in ('draft','published','archived')),
  visibility       text not null default 'private' check (visibility in ('private','public','public_promoted')),
  moderation       text not null default 'approved' check (moderation in ('approved','pending','rejected')),
  moderation_note  text,
  rating           numeric(2,1) not null default 0,
  rating_count     int not null default 0,
  students_count   int not null default 0,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(subtitle,''))) stored
);
create index courses_tenant_idx on public.courses (tenant_id, status);
create index courses_market_idx on public.courses (visibility, moderation, status);
create index courses_search_idx on public.courses using gin (search);

create table public.course_tutors (          -- tutors assigned to a course (owner always has access)
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (course_id, user_id)
);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  title      text not null,
  position   int not null default 0
);
create index modules_course_idx on public.modules (course_id, position);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  type          text not null default 'video' check (type in ('video','pdf','quiz')),
  duration_sec  int,
  size_mb       numeric(10,1),
  preview       boolean not null default false,
  description   text,
  resources     jsonb not null default '[]',
  completion    text not null default 'watch_90' check (completion in ('watch_90','manual')),
  video_uid     text,      -- Cloudflare Stream video id; playback only through a signed URL
  file_path     text,      -- storage path for PDFs
  position      int not null default 0
);
create index lessons_course_idx on public.lessons (course_id);

-- ─────────────── Learning ───────────────
create table public.enrollments (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id),
  source       text not null default 'direct',
  order_id     uuid,
  enrolled_at  timestamptz not null default now(),
  valid_till   timestamptz,                    -- null = lifetime
  primary key (user_id, course_id)
);
create index enrollments_tenant_idx on public.enrollments (tenant_id, user_id);

create table public.lesson_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  position_sec  int not null default 0,
  completed     boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.reviews (
  course_id   uuid not null references public.courses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  body        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- ─────────────── Money ───────────────
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,   -- Bodhin promo codes = coupons of the Bodhin tenant
  code        text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  type        text not null check (type in ('pct','flat')),
  value       int not null check (value > 0),          -- pct: 1–90, flat: rupees
  course_ids  uuid[] not null default '{}',            -- empty = all this workspace's courses
  max_uses    int,
  used        int not null default 0,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  paused      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (type <> 'pct' or value <= 90),
  check (ends_at > starts_at)
);
create unique index coupons_code_idx on public.coupons (tenant_id, code);

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id),
  course_id            uuid not null references public.courses(id),
  seller_tenant_id     uuid not null references public.tenants(id),
  checkout_tenant_id   uuid references public.tenants(id),          -- null = thebodhin.com
  channel              text not null check (channel in ('bodhin_own','tutor_direct','bodhin_marketplace')),
  collector            text not null check (collector in ('bodhin','educator')),
  list_paise           bigint not null,
  discount_paise       bigint not null default 0,
  amount_paise         bigint not null,                   -- what the learner pays (GST inclusive)
  gst_paise            bigint not null default 0,
  coupon_id            uuid references public.coupons(id),
  coupon_code          text,
  commission_paise     bigint not null default 0,
  gateway_fee_paise    bigint not null default 0,
  educator_share_paise bigint not null default 0,
  status               text not null default 'created' check (status in ('created','paid','failed','refunded')),
  gateway              text not null default 'razorpay',
  gateway_order_id     text unique,
  gateway_payment_id   text unique,
  invoice_no           text,
  source               text not null default 'direct',
  payout_status        text not null default 'not_applicable' check (payout_status in ('not_applicable','on_hold','ready','paid','held')),
  payout_date          timestamptz,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz,
  check (commission_paise + gateway_fee_paise + educator_share_paise = amount_paise or status <> 'paid' or channel <> 'bodhin_marketplace')
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_seller_idx on public.orders (seller_tenant_id, created_at desc);
create index orders_payout_idx on public.orders (payout_status, payout_date);
-- Invoice numbers are unique per issuer: Bodhin's series, or each tutor's own series.
create unique index orders_invoice_idx on public.orders ((case when collector = 'bodhin' then 'bodhin' else seller_tenant_id::text end), invoice_no);

create table public.refund_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id),
  user_id     uuid not null references public.profiles(id),
  reason      text not null,
  status      text not null default 'open' check (status in ('open','approved','rejected')),
  decided_by  uuid references public.profiles(id),
  note        text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index one_open_refund on public.refund_requests (order_id) where status = 'open';

-- Subscription invoices Bodhin issues to workspaces.
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  no           text not null unique,
  description  text not null,
  amount_paise bigint not null,        -- incl. GST
  status       text not null check (status in ('paid','due','failed')),
  created_at   timestamptz not null default now()
);

create table public.invoice_counters (series text primary key, last int not null default 0);

create table public.gateway_events (     -- raw webhooks, processed once
  event_id     text primary key,
  tenant_id    uuid,
  type         text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  received_at  timestamptz not null default now()
);

-- ─────────────── Ops ───────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'system',
  title       text not null,
  body        text not null default '',
  link        jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique default ('BOD-' || (4600 + floor(random()*90000))::int),
  user_id     uuid not null references public.profiles(id),
  tenant_id   uuid references public.tenants(id),
  subject     text not null,
  status      text not null default 'open' check (status in ('open','pending','resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  staff       boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Append-only: no one can update or delete rows (enforced in 0003).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  target_kind text not null,
  target_id   text not null,
  target_label text,
  summary     text not null,
  reason      text,
  before      jsonb,
  after       jsonb
);
create index audit_at_idx on public.audit_log (at desc);

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0002 — business rules as database functions
-- Same rules as apps/student/src/core/business.ts and the POC tests.
-- Errors are raised with a plain-language message the app shows as is.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Who is calling ───────────────
create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

create or replace function public.staff_can(p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.role_perms r on r.role = p.staff_role
    where p.id = auth.uid() and not p.locked and r.perm = p_perm);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and staff_role is not null and not locked);
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.role = any(p_roles));
$$;

create or replace function public.bodhin_tenant() returns uuid
language sql stable security definer set search_path = '' as $$ select bodhin_tenant_id from public.platform_config where id = 1; $$;

-- ─────────────── Audit (every staff write) ───────────────
create or replace function public.write_audit(p_action text, p_kind text, p_id text, p_label text, p_summary text, p_reason text default null, p_before jsonb default null, p_after jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_name, action, target_kind, target_id, target_label, summary, reason, before, after)
  values (auth.uid(), (select name from public.profiles where id = auth.uid()), p_action, p_kind, p_id, p_label, p_summary, p_reason, p_before, p_after);
$$;

create or replace function public.require_reason(p_reason text) returns void language plpgsql as $$
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Please add a short reason (at least 5 characters). It goes into the audit log.' using errcode = 'P0001', hint = 'reason';
  end if;
end $$;

-- ─────────────── Plans & limits ───────────────
-- Plan + add-ons + admin overrides → what the workspace can use. null limit = unlimited.
create or replace function public.tenant_entitlements(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.tenant_subscriptions; p public.plans; a record;
  stu int; sto int; liv int; sea int; feats text[]; ov jsonb;
begin
  select * into s from public.tenant_subscriptions where tenant_id = p_tenant;
  if not found then return jsonb_build_object('students', 0, 'storage_gb', 0, 'live_hours', 0, 'seats', 0, 'features', '[]'::jsonb); end if;
  select * into p from public.plans where id = s.plan;
  stu := p.active_students; sto := p.storage_gb; liv := p.live_hours; sea := p.tutor_seats; feats := p.features;
  for a in select ad.*, (x ->> 'qty')::int as qty from jsonb_array_elements(s.addons) x join public.addons ad on ad.kind = x ->> 'kind' loop
    if stu is not null then stu := stu + a.adds_students * a.qty; end if;
    if sto is not null then sto := sto + a.adds_storage_gb * a.qty; end if;
    if liv is not null then liv := liv + a.adds_live_hours * a.qty; end if;
    if sea is not null then sea := sea + a.adds_seats * a.qty; end if;
    if a.adds_feature is not null and not a.adds_feature = any(feats) then feats := feats || a.adds_feature; end if;
  end loop;
  ov := coalesce(s.overrides, '{}'::jsonb);
  if ov -> 'limits' ? 'activeStudents' then stu := (ov -> 'limits' ->> 'activeStudents')::int; end if;
  if ov -> 'limits' ? 'storageGb' then sto := (ov -> 'limits' ->> 'storageGb')::int; end if;
  if ov -> 'limits' ? 'liveHours' then liv := (ov -> 'limits' ->> 'liveHours')::int; end if;
  if ov -> 'limits' ? 'tutorSeats' then sea := (ov -> 'limits' ->> 'tutorSeats')::int; end if;
  select coalesce(array_agg(f), '{}') into feats from (
    select unnest(feats) f except select key from jsonb_each_text(coalesce(ov -> 'features', '{}')) where value = 'false'
    union select key from jsonb_each_text(coalesce(ov -> 'features', '{}')) where value = 'true') q;
  return jsonb_build_object('plan', s.plan, 'students', stu, 'storage_gb', sto, 'live_hours', liv, 'seats', sea, 'features', to_jsonb(feats));
end $$;

create or replace function public.tenant_has(p_tenant uuid, p_feature text) returns boolean
language sql stable as $$ select public.tenant_entitlements(p_tenant) -> 'features' ? p_feature; $$;

-- Active student = a learner with at least one current enrolment in this workspace.
create or replace function public.active_students(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct user_id)::int from public.enrollments
  where tenant_id = p_tenant and (valid_till is null or valid_till > now());
$$;

-- Why a learner can't enrol in this workspace right now (null = open). 100% policy: new enrolments pause, nothing is deleted.
create or replace function public.enrol_block(p_tenant uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare lim int; already boolean;
begin
  if (select status from public.tenants where id = p_tenant) = 'suspended' then
    return 'This academy is not accepting new enrolments right now.';
  end if;
  select exists (select 1 from public.enrollments where tenant_id = p_tenant and user_id = p_user and (valid_till is null or valid_till > now())) into already;
  if already then return null; end if;
  lim := (public.tenant_entitlements(p_tenant) ->> 'students')::int;
  if lim is not null and public.active_students(p_tenant) >= lim then
    return 'This academy isn’t taking new enrolments right now. Please try again later.';
  end if;
  return null;
end $$;

-- ─────────────── Money ───────────────
-- bodhin_own: Bodhin's course → Bodhin 100%. tutor_direct: sold on the tutor's own site → tutor's gateway, 0% to Bodhin.
-- bodhin_marketplace: tutor course sold on thebodhin.com → Bodhin collects, keeps commission, pays the tutor.
create or replace function public.payment_route(p_course_tenant uuid, p_checkout_tenant uuid, out channel text, out collector text)
language plpgsql stable as $$
begin
  if p_course_tenant = public.bodhin_tenant() then channel := 'bodhin_own'; collector := 'bodhin';
  elsif p_checkout_tenant = p_course_tenant then channel := 'tutor_direct'; collector := 'educator';
  else channel := 'bodhin_marketplace'; collector := 'bodhin';
  end if;
end $$;

-- Refund hold, then the next payout weekday, 10:00 IST.
create or replace function public.payout_date_for(p_paid timestamptz) returns timestamptz
language plpgsql stable as $$
declare c public.platform_config; d date; begin
  select * into c from public.platform_config where id = 1;
  d := ((p_paid at time zone 'Asia/Kolkata') + make_interval(days => c.refund_hold_days))::date;
  while extract(dow from d)::int <> c.payout_weekday loop d := d + 1; end loop;
  return (d + time '10:00') at time zone 'Asia/Kolkata';
end $$;

create or replace function public.next_invoice_no(p_series text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare n int; fy text; y int := extract(year from now() at time zone 'Asia/Kolkata')::int;
begin
  -- Indian financial year: April–March, e.g. 2627 for FY 2026-27. Max 16 characters (GST rule): SERIE/2627/00001.
  if extract(month from now() at time zone 'Asia/Kolkata') < 4 then y := y - 1; end if;
  fy := lpad(((y % 100))::text, 2, '0') || lpad((((y + 1) % 100))::text, 2, '0');
  insert into public.invoice_counters as ic (series, last) values (p_series || ':' || fy, 1)
    on conflict (series) do update set last = ic.last + 1 returning last into n;
  return left(upper(p_prefix), 5) || '/' || fy || '/' || lpad(n::text, 5, '0');
end $$;

-- Price, coupon, GST and who collects — computed on the server, never trusted from the app.
create or replace function public.quote_for(p_user uuid, p_course uuid, p_coupon text, p_checkout_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.courses; r record; cp public.coupons; v_code text := upper(trim(coalesce(p_coupon, '')));
  disc bigint := 0; total bigint; gst numeric; blocked text; seller public.tenants; pay public.tenant_payment_settings;
begin
  select * into c from public.courses where id = p_course and status = 'published';
  if not found then raise exception 'This course is not available.' using errcode = 'P0001'; end if;
  select * into seller from public.tenants where id = c.tenant_id;
  select * into r from public.payment_route(c.tenant_id, p_checkout_tenant);
  if v_code <> '' then
    -- A coupon belongs to one workspace and works only on that workspace's courses (Bodhin promo codes → Bodhin courses only).
    select * into cp from public.coupons k where k.tenant_id = c.tenant_id and k.code = v_code limit 1;
    if not found then
      if exists (select 1 from public.coupons k where k.tenant_id = public.bodhin_tenant() and k.code = v_code) then
        raise exception 'This code is only valid on Bodhin’s own courses.' using errcode = 'P0001', hint = 'coupon';
      end if;
      raise exception 'This coupon code is not valid for this course.' using errcode = 'P0001', hint = 'coupon';
    end if;
    if cp.paused or now() < cp.starts_at or now() > cp.ends_at or (cp.max_uses is not null and cp.used >= cp.max_uses)
       or (cardinality(cp.course_ids) > 0 and not p_course = any(cp.course_ids)) then
      raise exception 'This coupon has expired or is not valid for this course.' using errcode = 'P0001', hint = 'coupon';
    end if;
    disc := case when cp.type = 'pct' then round(c.price_paise * cp.value / 100.0) else least(cp.value::bigint * 100, c.price_paise) end;
  end if;
  total := c.price_paise - disc;
  gst := (select gst_rate from public.platform_config where id = 1);
  blocked := public.enrol_block(c.tenant_id, p_user);
  if blocked is null and r.collector = 'educator' then
    select * into pay from public.tenant_payment_settings where tenant_id = c.tenant_id;
    if coalesce(pay.direct_gateway_status, 'not_connected') <> 'active' then blocked := 'This academy hasn’t finished payment setup yet. Please try again later.'; end if;
  end if;
  if blocked is null and r.channel = 'bodhin_marketplace' and not (select marketplace_checkout from public.feature_flags where id = 1) then
    blocked := 'Marketplace checkout is paused for maintenance. Please try again shortly.';
  end if;
  return jsonb_build_object(
    'course_id', c.id, 'list_paise', c.price_paise, 'discount_paise', disc, 'total_paise', total,
    'gst_paise', total - round(total / (1 + gst)), 'coupon_id', cp.id, 'coupon_code', nullif(v_code, ''),
    'coupon_label', case when cp.id is null then null when cp.type = 'pct' then cp.value || '% off' else '₹' || cp.value || ' off' end,
    'channel', r.channel, 'collector', r.collector, 'seller_tenant_id', c.tenant_id, 'seller_name', seller.display_name, 'blocked', blocked);
end $$;

create or replace function public.checkout_quote(p_course uuid, p_coupon text default null, p_checkout_tenant uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.quote_for(auth.uid(), p_course, p_coupon, p_checkout_tenant);
$$;

-- Called by the checkout Edge Function (service role) before opening Razorpay.
create or replace function public.create_order(p_user uuid, p_course uuid, p_coupon text, p_checkout_tenant uuid, p_source text default 'direct')
returns public.orders language plpgsql security definer set search_path = '' as $$
declare q jsonb; o public.orders; cfg public.platform_config; amt bigint; comm bigint := 0; fee bigint := 0; share bigint := 0;
begin
  if not public.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.enrollments where user_id = p_user and course_id = p_course) then
    raise exception 'You already have this course.' using errcode = 'P0001';
  end if;
  q := public.quote_for(p_user, p_course, p_coupon, p_checkout_tenant);
  if q ->> 'blocked' is not null then raise exception '%', q ->> 'blocked' using errcode = 'P0001'; end if;
  select * into cfg from public.platform_config where id = 1;
  amt := (q ->> 'total_paise')::bigint;
  if q ->> 'channel' = 'bodhin_marketplace' then
    comm := round(amt * cfg.commission_rate); fee := round(amt * cfg.gateway_fee_rate); share := amt - comm - fee;
  elsif q ->> 'channel' = 'tutor_direct' then share := amt;
  else comm := amt;      -- Bodhin own: 100% Bodhin
  end if;
  insert into public.orders (user_id, course_id, seller_tenant_id, checkout_tenant_id, channel, collector, list_paise, discount_paise, amount_paise, gst_paise,
                             coupon_id, coupon_code, commission_paise, gateway_fee_paise, educator_share_paise, source)
  values (p_user, p_course, (q ->> 'seller_tenant_id')::uuid, p_checkout_tenant, q ->> 'channel', q ->> 'collector', (q ->> 'list_paise')::bigint,
          (q ->> 'discount_paise')::bigint, amt, (q ->> 'gst_paise')::bigint, (q ->> 'coupon_id')::uuid, q ->> 'coupon_code', comm, fee, share, coalesce(p_source, 'direct'))
  returning * into o;
  return o;
end $$;

-- Enrolment shared by paid and free paths.
create or replace function public.grant_enrolment(p_user uuid, p_course uuid, p_source text, p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  select * into c from public.courses where id = p_course;
  insert into public.enrollments (user_id, course_id, tenant_id, source, order_id, valid_till)
  values (p_user, p_course, c.tenant_id, p_source, p_order, case when c.access_months is null then null else now() + make_interval(months => c.access_months) end)
  on conflict do nothing;
  if found then
    update public.courses set students_count = students_count + 1 where id = p_course;
    insert into public.memberships (user_id, tenant_id, role) values (p_user, c.tenant_id, 'student') on conflict do nothing;
  end if;
end $$;

-- Called by the Razorpay webhook / verify function (service role). Idempotent: a repeated webhook does nothing.
create or replace function public.mark_order_paid(p_order uuid, p_payment_id text) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.tenants; series text;
begin
  if not public.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return o; end if;
  select * into t from public.tenants where id = o.seller_tenant_id;
  -- Invoice series: Bodhin collects → Bodhin's series; tutor direct → invoice in the tutor's name.
  -- one counter per seller (each supplier numbers its own invoices); printed prefix is 5 letters
  series := case when o.collector = 'bodhin' then 'bodhin' else t.id::text end;
  update public.orders set status = 'paid', gateway_payment_id = p_payment_id, paid_at = now(), invoice_no = public.next_invoice_no(series, case when o.collector = 'bodhin' then 'BOD' else regexp_replace(t.slug, '[^a-z0-9]', '', 'g') end),
    payout_status = case when channel = 'bodhin_marketplace' then 'on_hold' else 'not_applicable' end,
    payout_date = case when channel = 'bodhin_marketplace' then public.payout_date_for(now()) else null end
  where id = p_order returning * into o;
  if o.coupon_id is not null then update public.coupons set used = used + 1 where id = o.coupon_id; end if;
  perform public.grant_enrolment(o.user_id, o.course_id, o.source, o.id);
  insert into public.notifications (user_id, kind, title, body, link)
  values (o.user_id, 'purchase', 'You’re enrolled!', 'Your payment was successful. Invoice ' || o.invoice_no || '.', jsonb_build_object('pathname', '/learn/' || o.course_id));
  if t.owner_id is not null then
    insert into public.notifications (user_id, kind, title, body)
    values (t.owner_id, 'sale', 'New enrolment', 'A learner bought ' || (select title from public.courses where id = o.course_id) || '.');
  end if;
  return o;
end $$;

-- Free course enrolment (learner calls this directly).
create or replace function public.enroll_free(p_course uuid, p_source text default 'direct') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses; b text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = 'P0001'; end if;
  select * into c from public.courses where id = p_course and status = 'published';
  if not found then raise exception 'This course is not available.' using errcode = 'P0001'; end if;
  if c.price_paise <> 0 then raise exception 'This course is paid.' using errcode = 'P0001'; end if;
  b := public.enrol_block(c.tenant_id, auth.uid());
  if b is not null then raise exception '%', b using errcode = 'P0001'; end if;
  perform public.grant_enrolment(auth.uid(), p_course, coalesce(p_source, 'direct'), null);
end $$;

-- ─────────────── Educator onboarding ───────────────
create or replace function public.submit_application(p_workspace text, p_slug text, p_subjects text[], p_years int, p_city text, p_students int, p_sample text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = 'P0001'; end if;
  if not (select tutor_signups from public.feature_flags where id = 1) then
    raise exception 'New educator sign-ups are paused right now. Please try again soon.' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,30}$' or exists (select 1 from public.reserved_slugs where slug = p_slug) or exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'That web address is taken. Try another.' using errcode = 'P0001', hint = 'slug';
  end if;
  insert into public.educator_applications (user_id, status, workspace_name, slug, subjects, experience_years, city, planned_students, sample_url, submitted_at)
  values (auth.uid(), 'submitted', p_workspace, p_slug, p_subjects, p_years, p_city, p_students, p_sample, now())
  on conflict (user_id) where status in ('draft','submitted','under_review','changes_requested')
  do update set status = 'submitted', workspace_name = excluded.workspace_name, slug = excluded.slug, subjects = excluded.subjects,
     experience_years = excluded.experience_years, city = excluded.city, planned_students = excluded.planned_students, sample_url = excluded.sample_url, submitted_at = now()
  returning educator_applications.id into v_id;
  return v_id;
end $$;

-- Approve → workspace + 14-day trial on the trial plan + owner membership. Manual approval by staff.
create or replace function public.approve_educator(p_app uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.educator_applications; t uuid; cfg public.platform_config;
begin
  if not public.staff_can('approvals.educators') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  select * into a from public.educator_applications where id = p_app for update;
  if a.status not in ('submitted','under_review','changes_requested') then raise exception 'This application was already decided.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants where slug = a.slug) then raise exception 'That web address is now taken. Ask the educator for another.' using errcode = 'P0001'; end if;
  select * into cfg from public.platform_config where id = 1;
  insert into public.tenants (slug, display_name, owner_id) values (a.slug, a.workspace_name, a.user_id) returning id into t;
  insert into public.tenant_subscriptions (tenant_id, plan, status, period_end) values (t, cfg.trial_plan, 'trialing', now() + make_interval(days => cfg.trial_days));
  insert into public.tenant_payment_settings (tenant_id) values (t);
  insert into public.tenant_usage (tenant_id) values (t);
  insert into public.memberships (user_id, tenant_id, role) values (a.user_id, t, 'owner');
  update public.educator_applications set status = 'approved', tenant_id = t, reviewed_at = now(), reviewed_by = auth.uid() where id = p_app;
  insert into public.notifications (user_id, kind, title, body, link) values (a.user_id, 'system', 'Your academy is approved 🎉',
    'Your ' || cfg.trial_days || '-day trial has started. Set up your first course.', '{"pathname":"/educator"}');
  perform public.write_audit('application.approve', 'application', p_app::text, a.workspace_name, 'Approved ' || a.workspace_name || ' (' || cfg.trial_days || '-day ' || cfg.trial_plan || ' trial)');
  return t;
end $$;

create or replace function public.decide_educator(p_app uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.educator_applications;
begin
  if not public.staff_can('approvals.educators') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('rejected','changes_requested') then raise exception 'Use approve_educator to approve.'; end if;
  perform public.require_reason(p_note);
  update public.educator_applications set status = p_decision, note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_app and status in ('submitted','under_review','changes_requested') returning * into a;
  if not found then raise exception 'This application was already decided.' using errcode = 'P0001'; end if;
  insert into public.notifications (user_id, kind, title, body) values (a.user_id, 'system',
    case when p_decision = 'rejected' then 'Application not approved' else 'Changes requested on your application' end, p_note);
  perform public.write_audit('application.' || p_decision, 'application', p_app::text, a.workspace_name, p_decision || ': ' || a.workspace_name, p_note);
end $$;

-- ─────────────── Course moderation ───────────────
create or replace function public.decide_course(p_course uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  if not public.staff_can('approvals.courses') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  perform set_config('bodhin.moderating', 'on', true);
  update public.courses set moderation = p_decision, moderation_note = p_note where id = p_course returning * into c;
  insert into public.notifications (user_id, kind, title, body)
  select owner_id, 'system', case when p_decision = 'approved' then 'Your course is live on Bodhin' else 'Listing needs changes' end,
         c.title || coalesce(' — ' || p_note, '') from public.tenants where id = c.tenant_id and owner_id is not null;
  perform public.write_audit('course.' || p_decision, 'course', p_course::text, c.title, p_decision || ': ' || c.title, p_note);
end $$;

-- Educators can't approve themselves: going public sends a course to review; only staff set moderation.
create or replace function public.courses_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() or current_setting('bodhin.moderating', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    new.tenant_id := old.tenant_id; new.rating := old.rating; new.rating_count := old.rating_count; new.students_count := old.students_count;
    new.moderation := old.moderation; new.moderation_note := old.moderation_note;
  else
    new.rating := 0; new.rating_count := 0; new.students_count := 0; new.moderation := 'approved'; new.moderation_note := null;
  end if;
  if new.visibility <> 'private' and new.tenant_id <> public.bodhin_tenant()
     and (tg_op = 'INSERT' or old.visibility = 'private' or old.moderation = 'rejected' or new.title <> old.title or new.price_paise <> old.price_paise) then
    new.moderation := 'pending';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
create trigger courses_guard before insert or update on public.courses for each row execute function public.courses_guard();

-- Coupons need the 'coupons' feature (Creator+); the Bodhin tenant can always create promo codes.
create or replace function public.coupons_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() then return new; end if;
  new.code := upper(new.code);
  if tg_op = 'INSERT' then new.used := 0; else new.used := old.used; new.tenant_id := old.tenant_id; end if;
  if new.tenant_id <> public.bodhin_tenant() and not public.tenant_has(new.tenant_id, 'coupons') then
    raise exception 'Coupons are available from the Creator plan.' using errcode = 'P0001';
  end if;
  if cardinality(new.course_ids) > 0 and exists (select 1 from public.courses where id = any(new.course_ids) and tenant_id <> new.tenant_id) then
    raise exception 'You can only add your own courses to a coupon.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger coupons_guard before insert or update on public.coupons for each row execute function public.coupons_guard();

-- "Hide Powered by Bodhin" needs white-label; slug, owner and status are not editable by the workspace.
create or replace function public.tenants_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() or public.staff_can('tenants.manage') then return new; end if;
  new.slug := old.slug; new.owner_id := old.owner_id; new.status := old.status;
  new.custom_domain := old.custom_domain; new.domain_status := old.domain_status;
  if new.hide_powered_by and not public.tenant_has(new.id, 'white_label') then new.hide_powered_by := false; end if;
  return new;
end $$;
create trigger tenants_guard before update on public.tenants for each row execute function public.tenants_guard();

-- ─────────────── Platform settings & flags (staff) ───────────────
create or replace function public.save_platform_config(p_next jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  if not public.staff_can('config.edit') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  select to_jsonb(c) into before from public.platform_config c where id = 1;
  if (select monthly_paise from public.plans where id = coalesce(p_next ->> 'trial_plan', before ->> 'trial_plan')) is null then
    raise exception 'Trial plan must be a priced plan (not Enterprise).' using errcode = 'P0001';
  end if;
  update public.platform_config set                     -- bodhin_tenant_id is intentionally not updatable here
    commission_rate = coalesce((p_next ->> 'commission_rate')::numeric, commission_rate),
    gateway_fee_rate = coalesce((p_next ->> 'gateway_fee_rate')::numeric, gateway_fee_rate),
    refund_hold_days = coalesce((p_next ->> 'refund_hold_days')::int, refund_hold_days),
    payout_weekday = coalesce((p_next ->> 'payout_weekday')::int, payout_weekday),
    attribution_days = coalesce((p_next ->> 'attribution_days')::int, attribution_days),
    trial_days = coalesce((p_next ->> 'trial_days')::int, trial_days),
    trial_plan = coalesce(p_next ->> 'trial_plan', trial_plan),
    updated_at = now()
  where id = 1;
  perform public.write_audit('config.update', 'config', 'platform', 'Platform settings', 'Updated platform settings', p_reason, before, (select to_jsonb(c) from public.platform_config c where id = 1));
end $$;

create or replace function public.save_flags(p_next jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  if not public.staff_can('config.edit') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  select to_jsonb(f) into before from public.feature_flags f where id = 1;
  update public.feature_flags set
    tutor_signups = coalesce((p_next ->> 'tutor_signups')::boolean, tutor_signups),
    marketplace_checkout = coalesce((p_next ->> 'marketplace_checkout')::boolean, marketplace_checkout),
    live_classes = coalesce((p_next ->> 'live_classes')::boolean, live_classes),
    maintenance = coalesce((p_next ->> 'maintenance')::boolean, maintenance),
    maintenance_message = coalesce(p_next ->> 'maintenance_message', maintenance_message),
    updated_at = now()
  where id = 1;
  perform public.write_audit('flags.update', 'config', 'flags', 'Kill switches', 'Changed kill switches', p_reason, before, (select to_jsonb(f) from public.feature_flags f where id = 1));
end $$;

create or replace function public.set_user_lock(p_user uuid, p_locked boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('users.manage') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You can’t lock your own account.' using errcode = 'P0001'; end if;
  perform public.require_reason(p_reason);
  update public.profiles set locked = p_locked, lock_reason = case when p_locked then p_reason end where id = p_user;
  perform public.write_audit(case when p_locked then 'user.lock' else 'user.unlock' end, 'user', p_user::text, (select name from public.profiles where id = p_user),
    case when p_locked then 'Locked account' else 'Unlocked account' end, p_reason);
end $$;

create or replace function public.set_staff_role(p_user uuid, p_role text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('admins.manage') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  if (select staff_role from public.profiles where id = p_user) = 'super_admin' and coalesce(p_role, '') <> 'super_admin'
     and (select count(*) from public.profiles where staff_role = 'super_admin' and not locked) <= 1 then
    raise exception 'Bodhin must always have at least one Super Admin.' using errcode = 'P0001';
  end if;
  update public.profiles set staff_role = p_role where id = p_user;
  perform public.write_audit('admin.role', 'admin', p_user::text, (select name from public.profiles where id = p_user), 'Staff role → ' || coalesce(p_role, 'none'), p_reason);
end $$;

-- ─────────────── New user → profile ───────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)), coalesce(new.email, ''), coalesce(new.phone, new.raw_user_meta_data ->> 'phone'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────── Reviews keep the course rating current ───────────────
create or replace function public.refresh_rating() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses set rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where course_id = cid), 0),
    rating_count = (select count(*) from public.reviews where course_id = cid) where id = cid;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews for each row execute function public.refresh_rating();

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0003 — Row-Level Security (who can see / change what)
-- Rule of thumb: the app reads through these policies; every money or
-- approval WRITE goes through a function in 0002 (or an Edge Function).
-- ════════════════════════════════════════════════════════════════════

-- Helpers
-- Row-based check (works for a row being inserted, before it exists in the table).
create or replace function public.can_edit_course_row(p_tenant uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.role = 'owner')
      or exists (select 1 from public.course_tutors ct where ct.course_id = p_course and ct.user_id = auth.uid())
      or (p_tenant = (select bodhin_tenant_id from public.platform_config where id = 1) and public.staff_can('content.bodhin'));
$$;
create or replace function public.can_edit_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_edit_course_row(c.tenant_id, c.id) from public.courses c where c.id = p_course), false);
$$;

create or replace function public.can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = p_course and (c.status = 'published' or public.can_edit_course(c.id) or public.staff_can('approvals.courses')));
$$;

create or replace function public.is_enrolled(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments where user_id = auth.uid() and course_id = p_course and (valid_till is null or valid_till > now()));
$$;

-- Turn RLS on everywhere
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─────────────── Public catalogue & settings ───────────────
create policy "read plans"      on public.plans           for select using (true);
create policy "read addons"     on public.addons          for select using (true);
create policy "read config"     on public.platform_config for select using (true);
create policy "read flags"      on public.feature_flags   for select using (true);
create policy "read perms"      on public.role_perms      for select using (true);
create policy "read categories" on public.categories      for select using (not hidden or public.is_staff());
create policy "staff categories" on public.categories     for all using (public.staff_can('content.bodhin')) with check (public.staff_can('content.bodhin'));
create policy "read slugs"      on public.reserved_slugs  for select using (true);

-- ─────────────── People ───────────────
create policy "own profile" on public.profiles for select using (
  id = auth.uid() or public.staff_can('users.view') or public.staff_can('tenants.view')
  or exists (select 1 from public.enrollments e join public.memberships m on m.tenant_id = e.tenant_id
             where e.user_id = profiles.id and m.user_id = auth.uid() and m.role in ('owner','tutor'))
  or exists (select 1 from public.courses c where c.tutor_id = profiles.id and c.status = 'published'));   -- tutor names on course pages
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name, phone, avatar_url) on public.profiles to authenticated;

create policy "memberships" on public.memberships for select using (
  user_id = auth.uid() or public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('tenants.view'));

create policy "applications" on public.educator_applications for select using (user_id = auth.uid() or public.staff_can('approvals.educators'));

-- ─────────────── Workspaces ───────────────
create policy "read tenants" on public.tenants for select using (true);                 -- branding is public
create policy "owner edits branding" on public.tenants for update using (public.has_tenant_role(id, array['owner']) or public.staff_can('tenants.manage'));
revoke update on public.tenants from anon, authenticated;
grant update (display_name, tagline, primary_color, primary_deep, accent, logo_url, hide_powered_by) on public.tenants to authenticated;

create policy "read subscription" on public.tenant_subscriptions for select using (
  public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "read usage" on public.tenant_usage for select using (
  public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "read payment settings" on public.tenant_payment_settings for select using (
  public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
create policy "owner edits tax" on public.tenant_payment_settings for update using (public.has_tenant_role(tenant_id, array['owner']));
revoke update on public.tenant_payment_settings from anon, authenticated;
grant update (gstin) on public.tenant_payment_settings to authenticated;
-- tenant_secrets: RLS on, no policies → only the service role (Edge Functions) can read it.
revoke all on public.tenant_secrets from anon, authenticated;

-- ─────────────── Courses ───────────────
create policy "read courses" on public.courses for select using (status = 'published' or public.can_edit_course_row(tenant_id, id) or public.staff_can('approvals.courses'));
create policy "owner creates course" on public.courses for insert with check (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "edit course" on public.courses for update using (public.can_edit_course_row(tenant_id, id));
create policy "delete draft" on public.courses for delete using (public.can_edit_course_row(tenant_id, id) and status = 'draft' and not exists (select 1 from public.enrollments where course_id = courses.id));

create policy "read course tutors" on public.course_tutors for select using (public.can_see_course(course_id));
create policy "owner assigns tutors" on public.course_tutors for all
  using (exists (select 1 from public.courses c where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner'])))
  with check (exists (select 1 from public.courses c join public.memberships m on m.tenant_id = c.tenant_id and m.user_id = course_tutors.user_id and m.role = 'tutor'
                      where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner'])));

create policy "read modules" on public.modules for select using (public.can_see_course(course_id));
create policy "edit modules" on public.modules for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
create policy "read lessons" on public.lessons for select using (public.can_see_course(course_id));
create policy "edit lessons" on public.lessons for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

-- ─────────────── Learning ───────────────
create policy "read enrolments" on public.enrollments for select using (
  user_id = auth.uid() or public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('users.view'));
-- No insert/update policies: enrolments are created only by enroll_free() and mark_order_paid().

create policy "own progress" on public.lesson_progress for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_enrolled(course_id));
create policy "educator sees progress" on public.lesson_progress for select using (
  exists (select 1 from public.courses c where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner','tutor'])));

create policy "read reviews" on public.reviews for select using (true);
create policy "write own review" on public.reviews for insert with check (user_id = auth.uid() and public.is_enrolled(course_id));
create policy "edit own review" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete using (user_id = auth.uid());

-- ─────────────── Money ───────────────
create policy "owner coupons" on public.coupons for select using (public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
create policy "owner adds coupon" on public.coupons for insert with check (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "owner edits coupon" on public.coupons for update using (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "owner deletes unused coupon" on public.coupons for delete using (public.has_tenant_role(tenant_id, array['owner']) and used = 0);

create policy "read orders" on public.orders for select using (
  user_id = auth.uid() or public.has_tenant_role(seller_tenant_id, array['owner']) or public.staff_can('money.view'));
-- No write policies: orders are written only by create_order() / mark_order_paid() from Edge Functions.

create policy "read refunds" on public.refund_requests for select using (
  user_id = auth.uid() or public.staff_can('refunds')
  or exists (select 1 from public.orders o where o.id = order_id and public.has_tenant_role(o.seller_tenant_id, array['owner'])));
create policy "ask refund" on public.refund_requests for insert with check (
  user_id = auth.uid() and status = 'open' and exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'paid'
      and o.paid_at > now() - make_interval(days => (select refund_hold_days from public.platform_config where id = 1))));

create policy "read invoices" on public.invoices for select using (public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
revoke all on public.invoice_counters, public.gateway_events from anon, authenticated;

-- ─────────────── Ops ───────────────
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

create policy "own tickets" on public.tickets for select using (user_id = auth.uid() or public.staff_can('support.tickets'));
create policy "open ticket" on public.tickets for insert with check (user_id = auth.uid() and status = 'open');
create policy "staff updates ticket" on public.tickets for update using (public.staff_can('support.tickets'));
create policy "ticket messages" on public.ticket_messages for select using (
  exists (select 1 from public.tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.staff_can('support.tickets'))));
create policy "reply" on public.ticket_messages for insert with check (author_id = auth.uid() and exists (
  select 1 from public.tickets t where t.id = ticket_id and ((t.user_id = auth.uid() and not ticket_messages.staff) or public.staff_can('support.tickets'))));

create policy "read audit" on public.audit_log for select using (public.staff_can('audit.view'));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;   -- written only by write_audit()

-- ─────────────── Function access ───────────────
-- Internal money functions: Edge Functions (service role) only.
revoke execute on function public.create_order(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.grant_enrolment(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.quote_for(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.next_invoice_no(text, text) from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, text, uuid, text), public.mark_order_paid(uuid, text) to service_role;
-- Learner-facing: checkout_quote, enroll_free, submit_application. Staff-facing functions check permissions themselves.

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · seed — generated from the POC (apps/student/src). Safe to run once on a new project.
-- ════════════════════════════════════════════════════════════════════

-- Plans (prices in paise)
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('starter', 'Starter', 79900, 767000, 50, 5, 10, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace']::text[], false, 'Individual tutors and small cohorts', 0);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('creator', 'Creator', 149900, 1439000, 150, 20, 30, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons']::text[], false, 'Growing educators and course creators', 1);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('growth', 'Growth', 349900, 3359000, 500, 50, 100, 5, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports']::text[], true, 'Established educators and academies', 2);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('institute', 'Institute', 799900, 7679000, 1500, 150, 250, 25, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Larger institutes and multi-tutor teams', 3);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('enterprise', 'Enterprise', null, null, null, null, null, null, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Large or specialized deployments', 4);

-- Add-ons
insert into public.addons (kind, label, unit, monthly_paise, adds_students) values ('students', 'Student block', '+250 active students', 99900, 250);
insert into public.addons (kind, label, unit, monthly_paise, adds_storage_gb) values ('storage', 'Video storage', '+25 GB', 49900, 25);
insert into public.addons (kind, label, unit, monthly_paise, adds_live_hours) values ('live_hours', 'Live room-hours', '+20 hours / month', 69900, 20);
insert into public.addons (kind, label, unit, monthly_paise, adds_seats) values ('seats', 'Tutor seats', '+5 seats', 149900, 5);
insert into public.addons (kind, label, unit, monthly_paise, adds_feature) values ('custom_domain', 'Custom domain', 'your own domain + SSL', 49900, 'custom_domain');

-- Staff permissions
insert into public.role_perms (role, perm) values ('super_admin', 'overview');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.educators');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.courses');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.reports');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.view');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'plans.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'config.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'money.view');
insert into public.role_perms (role, perm) values ('super_admin', 'payouts.run');
insert into public.role_perms (role, perm) values ('super_admin', 'refunds');
insert into public.role_perms (role, perm) values ('super_admin', 'content.bodhin');
insert into public.role_perms (role, perm) values ('super_admin', 'users.view');
insert into public.role_perms (role, perm) values ('super_admin', 'users.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'support.tickets');
insert into public.role_perms (role, perm) values ('super_admin', 'broadcast');
insert into public.role_perms (role, perm) values ('super_admin', 'admins.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'audit.view');
insert into public.role_perms (role, perm) values ('finance', 'overview');
insert into public.role_perms (role, perm) values ('finance', 'tenants.view');
insert into public.role_perms (role, perm) values ('finance', 'money.view');
insert into public.role_perms (role, perm) values ('finance', 'payouts.run');
insert into public.role_perms (role, perm) values ('finance', 'refunds');
insert into public.role_perms (role, perm) values ('finance', 'audit.view');
insert into public.role_perms (role, perm) values ('moderator', 'overview');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.educators');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.courses');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.reports');
insert into public.role_perms (role, perm) values ('moderator', 'tenants.view');
insert into public.role_perms (role, perm) values ('moderator', 'content.bodhin');
insert into public.role_perms (role, perm) values ('support', 'overview');
insert into public.role_perms (role, perm) values ('support', 'tenants.view');
insert into public.role_perms (role, perm) values ('support', 'users.view');
insert into public.role_perms (role, perm) values ('support', 'users.manage');
insert into public.role_perms (role, perm) values ('support', 'support.tickets');

-- Reserved web addresses
insert into public.reserved_slugs (slug) values ('www'), ('app'), ('admin'), ('api'), ('mail'), ('help'), ('support'), ('blog'), ('bodhin'), ('static'), ('cdn'), ('status'), ('docs'), ('pay'), ('learn');

-- Categories
insert into public.categories (id, name, icon, sort) values ('all', 'All Courses', 'apps', 0);
insert into public.categories (id, name, icon, sort) values ('marketing', 'Marketing', 'megaphone', 1);
insert into public.categories (id, name, icon, sort) values ('ai-data', 'AI & Data', 'hardware-chip', 2);
insert into public.categories (id, name, icon, sort) values ('development', 'Development', 'code-slash', 3);
insert into public.categories (id, name, icon, sort) values ('design', 'Design', 'color-palette', 4);
insert into public.categories (id, name, icon, sort) values ('business', 'Business', 'briefcase', 5);

-- Bodhin itself is a workspace (its own courses: 100% to Bodhin)
insert into public.tenants (id, slug, display_name, tagline, primary_color, primary_deep, accent, hide_powered_by) values (md5('t_bodhin')::uuid, 'learn', 'Bodhin', 'Learn from India''s best educators', '#0F3D63', '#0A2A45', '#F2A93B', true);
insert into public.tenant_subscriptions (tenant_id, plan, status, period_end) values (md5('t_bodhin')::uuid, 'enterprise', 'active', '2099-12-31');
insert into public.tenant_payment_settings (tenant_id, direct_gateway_status) values (md5('t_bodhin')::uuid, 'active');
insert into public.tenant_usage (tenant_id) values (md5('t_bodhin')::uuid);
insert into public.platform_config (id, bodhin_tenant_id) values (1, md5('t_bodhin')::uuid);
insert into public.feature_flags (id) values (1);

-- Bodhin promo codes (valid only on Bodhin courses)
insert into public.coupons (tenant_id, code, type, value, ends_at) values (md5('t_bodhin')::uuid, 'BODHIN10', 'pct', 10, now() + interval '1 year'), (md5('t_bodhin')::uuid, 'WELCOME5', 'pct', 5, now() + interval '1 year');

-- Bodhin's own courses (demo content; videos are added later through the course builder)
insert into public.courses (id, tenant_id, title, subtitle, description, category_id, collections, level, format, language, price_paise, compare_at_paise, access_months, certificate, outcomes, art, status, visibility, moderation, published_at) values (md5('c_career')::uuid, md5('t_bodhin')::uuid, 'Career Launchpad: Communication & Interviews', 'Bodhin’s own program to get interview-ready in four weeks.', 'Resume, LinkedIn, spoken English for interviews and mock interviews with feedback. Built and taught by the Bodhin team.', 'business', array['career','job-ready']::text[], 'beginner', 'hybrid', 'English', 299900, null, null, true, array['ATS-friendly resume','LinkedIn profile that gets calls','Confident self-introduction','Answering HR & technical rounds']::text[], '{"from":"#0B3B73","to":"#D99A1E","icon":"briefcase"}'::jsonb, 'published', 'public_promoted', 'approved', now());
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn', 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l1')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn: overview', 'video', 720, null, true, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l2')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn in practice', 'video', 1080, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l3')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1320, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l4')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics', 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l1')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics: overview', 'video', 900, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l2')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics in practice', 'video', 1200, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l3')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1380, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l4')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds', 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l1')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds: overview', 'video', 1080, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l2')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds in practice', 'video', 1320, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l3')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1440, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l4')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews', 3);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l1')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews: overview', 'video', 1260, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l2')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews in practice', 'video', 1440, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l3')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1500, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l4')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews quiz', 'quiz', null, null, false, null, 3);

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0004 — refund decisions + listing quality bar
-- Run AFTER 0001–0003 + seed (or after bodhin_setup_all.sql).
-- Who decides a refund depends on who collected the money:
--   bodhin_own / bodhin_marketplace → Bodhin Finance (decide_refund)
--   tutor_direct                    → the academy owner (educator_decide_refund)
-- ════════════════════════════════════════════════════════════════════

-- Tell the right people when a learner asks for a refund.
create or replace function public.refund_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.tenants; c text;
begin
  select * into o from public.orders where id = new.order_id;
  select * into t from public.tenants where id = o.seller_tenant_id;
  select title into c from public.courses where id = o.course_id;
  insert into public.notifications (user_id, kind, title, body, link) values (new.user_id, 'system', 'Refund request received',
    case when o.channel = 'tutor_direct' then t.display_name else 'Bodhin' end || ' is reviewing your request for “' || c || '”. Most decisions take 1–2 working days.', '{"pathname":"/payments"}');
  if o.channel = 'tutor_direct' and t.owner_id is not null then
    insert into public.notifications (user_id, kind, title, body, link) values (t.owner_id, 'system', 'Refund request on a direct sale',
      'A learner asked for a refund on “' || c || '”. Review it in Earnings.', '{"pathname":"/edu/earnings"}');
  end if;
  return new;
end $$;
create trigger refund_requested after insert on public.refund_requests for each row execute function public.refund_requested();

-- Shared effect of an approved refund.
create or replace function public.apply_refund(p_req uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  select * into r from public.refund_requests where id = p_req;
  select * into o from public.orders where id = r.order_id for update;
  update public.orders set status = 'refunded',
    payout_status = case when channel = 'bodhin_marketplace' and payout_status <> 'paid' then 'not_applicable' else payout_status end
  where id = o.id;
  delete from public.enrollments where user_id = o.user_id and course_id = o.course_id;
  update public.courses set students_count = greatest(0, students_count - 1) where id = o.course_id;
  insert into public.notifications (user_id, kind, title, body, link) values (o.user_id, 'system',
    'Refund approved: ₹' || to_char(o.amount_paise / 100.0, 'FM99,99,999'), 'It reaches your original payment method in 5–7 working days.', '{"pathname":"/payments"}');
end $$;
revoke execute on function public.apply_refund(uuid) from public, anon, authenticated;

-- Bodhin Finance: refunds on money Bodhin collected.
create or replace function public.decide_refund(p_req uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  if not public.staff_can('refunds') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  select * into r from public.refund_requests where id = p_req for update;
  if not found or r.status <> 'open' then raise exception 'Already decided.' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = r.order_id;
  if o.channel = 'tutor_direct' then raise exception 'This was a direct sale — the educator refunds it from their own gateway.' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  update public.refund_requests set status = p_decision, decided_by = auth.uid(), note = p_note, decided_at = now() where id = p_req;
  if p_decision = 'approved' then perform public.apply_refund(p_req);
  else insert into public.notifications (user_id, kind, title, body) values (r.user_id, 'system', 'Refund request not approved', p_note);
  end if;
  perform public.write_audit('refund.' || p_decision, 'order', o.id::text, o.invoice_no,
    case when p_decision = 'approved' then 'Refunded ' || o.invoice_no else 'Rejected refund ' || o.invoice_no end, p_note);
end $$;

-- Academy owner: refunds on their own direct sales (the money is in their gateway).
create or replace function public.educator_decide_refund(p_req uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  select * into r from public.refund_requests where id = p_req for update;
  select * into o from public.orders where id = r.order_id;
  if not found or o.channel <> 'tutor_direct' or not public.has_tenant_role(o.seller_tenant_id, array['owner']) then
    raise exception 'Refund request not found.' using errcode = 'P0001';
  end if;
  if r.status <> 'open' then raise exception 'Already decided.' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Tell the learner why (5+ characters).' using errcode = 'P0001', hint = 'note';
  end if;
  update public.refund_requests set status = p_decision, decided_by = auth.uid(), note = p_note, decided_at = now() where id = p_req;
  if p_decision = 'approved' then perform public.apply_refund(p_req);
  else insert into public.notifications (user_id, kind, title, body) values (r.user_id, 'system', 'Refund request not approved', p_note);
  end if;
end $$;

-- Listing quality bar (same as the app): a marketplace listing needs 3+ lessons, 3+ outcomes,
-- a 50+ character description and a verified payout bank, before a moderator can approve it.
create or replace function public.decide_course(p_course uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses; n_lessons int; bank boolean;
begin
  if not public.staff_can('approvals.courses') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  select * into c from public.courses where id = p_course;
  if p_decision = 'approved' then
    select count(*) into n_lessons from public.lessons where course_id = p_course;
    select coalesce(payout_verified, false) into bank from public.tenant_payment_settings where tenant_id = c.tenant_id;
    if n_lessons < 3 or cardinality(array_remove(c.outcomes, '')) < 3 or length(c.description) < 50
       or (c.tenant_id <> public.bodhin_tenant() and not coalesce(bank, false)) then
      raise exception 'Can’t list yet: needs 3+ lessons, 3+ outcomes, a 50+ character description and a verified payout bank. Ask for changes instead.' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('bodhin.moderating', 'on', true);
  update public.courses set moderation = p_decision, moderation_note = p_note where id = p_course returning * into c;
  insert into public.notifications (user_id, kind, title, body)
  select owner_id, 'system', case when p_decision = 'approved' then 'Your course is live on Bodhin' else 'Listing needs changes' end,
         c.title || coalesce(' — ' || p_note, '') from public.tenants where id = c.tenant_id and owner_id is not null;
  perform public.write_audit('course.' || p_decision, 'course', p_course::text, c.title, p_decision || ': ' || c.title, p_note);
end $$;

