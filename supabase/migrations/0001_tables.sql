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
