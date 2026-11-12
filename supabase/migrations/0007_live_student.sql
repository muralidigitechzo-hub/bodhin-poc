-- 0007 · Student live room: attendance from real presence, class files, recording access.
-- Needs 0005_live.sql. Run once.

-- ── Attendance: minutes come from a server-side heartbeat, not from a number the app sends ──
alter table public.live_attendance add column if not exists last_ping timestamptz;

-- The app calls this once a minute while the learner is in the room. At most one minute is added per 50 seconds,
-- only inside the join window, and never beyond the class length + 30 minutes of grace.
create or replace function public.live_ping(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then return; end if;
  if now() < s.starts_at - interval '10 minutes' or now() > s.ends_at + interval '30 minutes' then return; end if;
  update public.live_attendance
     set minutes = least(minutes + 1, (extract(epoch from (s.ends_at - s.starts_at)) / 60)::int + 30),
         last_ping = now()
   where session_id = p_session and user_id = auth.uid()
     and (last_ping is null or now() - last_ping >= interval '50 seconds');
end $$;

-- Leaving no longer trusts a client-supplied number of minutes (kept with the same signature so old apps keep working).
create or replace function public.live_leave(p_session uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.live_attendance set last_ping = now() where session_id = p_session and user_id = auth.uid();
end $$;

grant execute on function public.live_ping(uuid) to authenticated;

-- ── Files the host shares during a class (stored in the private `live-files` bucket) ──
create table if not exists public.live_files (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.live_sessions(id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  size_bytes   bigint not null check (size_bytes between 0 and 52428800),   -- 50 MB
  storage_path text not null,
  shared_by    uuid not null references public.profiles(id),
  shared_at    timestamptz not null default now()
);
create index if not exists live_files_session_idx on public.live_files (session_id, shared_at);
alter table public.live_files enable row level security;

create policy "see class files" on public.live_files for select using (
  exists (select 1 from public.live_sessions s where s.id = session_id
          and (public.is_enrolled(s.course_id) or public.has_tenant_role(s.tenant_id, array['owner','tutor']))));
create policy "host shares files" on public.live_files for insert with check (
  shared_by = auth.uid() and exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));
create policy "host removes files" on public.live_files for delete using (
  exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));

-- ── Recording access: who may watch, and where the file is. The Edge Function `live-media` turns the path into a short-lived URL. ──
create or replace function public.live_recording(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then raise exception 'This class could not be found.' using errcode = 'P0002'; end if;
  if not (public.is_enrolled(s.course_id) or public.has_tenant_role(s.tenant_id, array['owner','tutor'])) then
    raise exception 'Only enrolled learners can watch this recording.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'state', case when s.status <> 'conducted' or not s.record then 'none' when s.recording_path is null then 'processing' else 'ready' end,
    'path', s.recording_path);
end $$;

grant execute on function public.live_recording(uuid) to authenticated;
