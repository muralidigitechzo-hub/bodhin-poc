-- ════════════════════════════════════════════════════════════════════
-- Bodhin · 0008 — Certificates & Creator Approval Requests
-- Mirrors src/core/certification.ts and certification in src/api/client.ts:
--   - Learners qualify at >= 75% lesson progress + all course quizzes passed.
--   - Qualifying raises one certificate_requests row (status = 'pending').
--   - Course creator (tenant owner / assigned tutor, or Bodhin staff for Bodhin's own courses)
--     approves (issuing a certificates row) or declines with a note.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.certificates (
  id          text primary key,                       -- e.g. BODHIN-DMAI-2026-1000
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  title       text not null,
  program     text not null default 'Course Completion',
  tutor_name  text not null,
  weeks       int not null default 2 check (weeks >= 1),
  template    jsonb,                                  -- snapshot of custom template used at issue time
  issued_at   timestamptz not null default now()
);

create table if not exists public.certificate_templates (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  template    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

create unique index if not exists certificates_user_course_uniq
  on public.certificates (user_id, course_id)
  where course_id is not null;

create index if not exists certificates_user_idx
  on public.certificates (user_id, issued_at desc);

create table if not exists public.certificate_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  progress_pct    int not null check (progress_pct between 0 and 100),
  quiz_pct        int check (quiz_pct is null or quiz_pct between 0 and 100),
  quizzes         int not null default 0 check (quizzes >= 0),
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id),
  decided_by_name text,
  note            text check (note is null or length(note) <= 300),
  cert_id         text references public.certificates(id) on delete set null
);

-- At most one active/historical request per (learner, course); re-request replaces a rejected row.
create unique index if not exists certificate_requests_user_course_uniq
  on public.certificate_requests (user_id, course_id);

create index if not exists certificate_requests_queue_idx
  on public.certificate_requests (tenant_id, status, requested_at);

create index if not exists certificate_requests_user_idx
  on public.certificate_requests (user_id, status);

-- ─────────────── Row-Level Security ───────────────
alter table public.certificates enable row level security;
alter table public.certificate_requests enable row level security;
alter table public.certificate_templates enable row level security;

create policy "read certificate templates"
  on public.certificate_templates for select
  using (
    public.has_tenant_role(tenant_id, array['owner', 'tutor'])
    or (tenant_id = (select bodhin_tenant_id from public.platform_config where id = 1) and public.staff_can('content.bodhin'))
  );

create policy "read own or course certificates"
  on public.certificates for select
  using (
    user_id = auth.uid()
    or (course_id is not null and public.can_edit_course(course_id))
    or public.staff_can('content.bodhin')
  );

create policy "read own or reviewable certificate requests"
  on public.certificate_requests for select
  using (
    user_id = auth.uid()
    or public.can_edit_course(course_id)
  );

-- Public certificate verification (safe fields only; does not expose the full table).
create or replace function public.verify_certificate(p_cert_id text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  rec record;
begin
  select c.id, p.name, c.title, c.program, c.issued_at, c.tutor_name
    into rec
    from public.certificates c
    join public.profiles p on p.id = c.user_id
   where upper(c.id) = upper(trim(p_cert_id))
   limit 1;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'id', rec.id,
    'name', rec.name,
    'title', rec.title,
    'program', rec.program,
    'issuedAt', rec.issued_at,
    'tutor', rec.tutor_name
  );
end;
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;
