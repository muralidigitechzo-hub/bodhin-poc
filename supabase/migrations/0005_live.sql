-- 0005 · Live classes: sessions, attendance, speaker permission, and the single "may this person join?" rule.
-- The Edge Function `live-token` only SIGNS a token after live_join_check() says yes, so the rules live here (testable), not in the function.

create table public.live_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  host_id     uuid not null references public.profiles(id),
  title       text not null check (length(title) between 3 and 120),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null check (ends_at > starts_at),
  record      boolean not null default true,
  status      text not null default 'scheduled' check (status in ('scheduled','live','conducted','cancelled')),
  recording_path text,
  created_at  timestamptz not null default now()
);
create index live_sessions_course_idx on public.live_sessions (course_id, starts_at);

create table public.live_attendance (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  minutes    int not null default 0,
  primary key (session_id, user_id)
);

-- Students the host has allowed to speak (raised-hand approval). Revoked by deleting the row.
create table public.live_speakers (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.live_sessions enable row level security;
alter table public.live_attendance enable row level security;
alter table public.live_speakers enable row level security;

create policy "see sessions" on public.live_sessions for select using (public.is_enrolled(course_id) or public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "host manages sessions" on public.live_sessions for all
  using (public.has_tenant_role(tenant_id, array['owner','tutor']))
  with check (public.has_tenant_role(tenant_id, array['owner','tutor']) and exists (select 1 from public.courses c where c.id = course_id and c.tenant_id = live_sessions.tenant_id));
create policy "own attendance" on public.live_attendance for select using (
  user_id = auth.uid() or exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));
-- No insert/update policy: attendance is written only by live_join_check() / live_leave().
create policy "speakers read" on public.live_speakers for select using (
  user_id = auth.uid() or exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));
create policy "host grants speaker" on public.live_speakers for all
  using (exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])))
  with check (exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));

-- live_join_check: called with the caller's JWT. Returns what the Edge Function needs to sign a token.
create or replace function public.live_join_check(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions; me uuid := auth.uid(); v_name text; v_role text; v_speak boolean;
begin
  if me is null then raise exception 'Sign in to join.' using errcode = '28000'; end if;
  select * into s from public.live_sessions where id = p_session;
  if not found or s.status = 'cancelled' then raise exception 'This class could not be found.' using errcode = 'P0002'; end if;
  if s.status = 'conducted' then raise exception 'This class has ended. The recording will be in Past & Attendance.' using errcode = 'P0001'; end if;
  if not (select live_classes from public.feature_flags where id = 1) then raise exception 'Live classes are temporarily unavailable. Please try again in a few minutes.' using errcode = 'P0001'; end if;
  if not public.tenant_has(s.tenant_id, 'live_classes') then raise exception 'Live classes are not included in this academy’s current plan.' using errcode = 'P0001'; end if;
  select name into v_name from public.profiles where id = me;

  if public.has_tenant_role(s.tenant_id, array['owner','tutor']) then
    v_role := 'host';
  elsif public.is_enrolled(s.course_id) then
    v_role := 'student';
  else
    raise exception 'Only enrolled learners can join this class.' using errcode = '42501';
  end if;

  if now() < s.starts_at - interval '10 minutes' then raise exception 'The room opens 10 minutes before the class starts.' using errcode = 'P0001'; end if;
  if now() > s.ends_at + interval '30 minutes' then raise exception 'This class has ended. The recording will be in Past & Attendance.' using errcode = 'P0001'; end if;

  select exists (select 1 from public.live_speakers where session_id = p_session and user_id = me) into v_speak;
  if v_role = 'student' then
    insert into public.live_attendance (session_id, user_id) values (p_session, me) on conflict do nothing;
  end if;
  return jsonb_build_object('room', s.tenant_id::text || ':' || s.id::text, 'role', v_role, 'name', coalesce(v_name, 'Learner'),
                            'identity', me::text, 'speak_allowed', v_speak, 'record', s.record);
end $$;

-- Student left: add the minutes they stayed (capped at the class length + grace so a forgotten tab can't inflate attendance).
create or replace function public.live_leave(p_session uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then return; end if;
  update public.live_attendance
     set minutes = minutes + least(greatest(p_minutes, 0), (extract(epoch from (s.ends_at - s.starts_at)) / 60)::int + 30)
   where session_id = p_session and user_id = auth.uid();
end $$;

grant execute on function public.live_join_check(uuid), public.live_leave(uuid, int) to authenticated;
