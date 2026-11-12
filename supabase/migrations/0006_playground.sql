-- 0006 · Playground: saved projects, solved challenges, and the daily quota for server-side runs.
-- Browser runners (HTML/CSS/JS, JS, TS, React, Python, SQL) cost nothing and are not metered.
-- Compiled languages run on Bodhin's code server (Piston) and are metered per learner per day.

create table public.playground_projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  stack      text not null check (stack ~ '^[a-z0-9-]{1,20}$'),
  title      text not null check (length(title) between 1 and 80),
  files      jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 8 and octet_length(files::text) <= 600000),
  updated_at timestamptz not null default now()
);
create index playground_projects_user_idx on public.playground_projects (user_id, updated_at desc);

create table public.playground_solved (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null check (challenge_id ~ '^[a-z0-9-]{1,40}$'),
  solved_at    timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table public.playground_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  remote_runs int not null default 0,
  primary key (user_id, day)
);

alter table public.playground_projects enable row level security;
alter table public.playground_solved enable row level security;
alter table public.playground_usage enable row level security;

create policy "own projects" on public.playground_projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own solved" on public.playground_solved for select using (user_id = auth.uid());
create policy "own usage" on public.playground_usage for select using (user_id = auth.uid());
-- solved / usage rows are written only through the functions below.

-- At most 30 saved projects per learner (the same number the app shows).
create or replace function public.playground_project_cap() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.playground_projects where user_id = new.user_id) >= 30 then
    raise exception 'You can keep up to 30 saved projects. Delete one to save a new one.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger playground_project_cap before insert or update on public.playground_projects for each row execute function public.playground_project_cap();

-- Use up `p_units` server runs for today, or refuse. Called by the Edge Function BEFORE it contacts the code server.
create or replace function public.playground_consume(p_units int) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); used int; lim constant int := 30;
begin
  if me is null then raise exception 'Sign in to run code.' using errcode = '28000'; end if;
  if p_units < 1 or p_units > 5 then raise exception 'Bad request.' using errcode = '22023'; end if;
  insert into public.playground_usage (user_id, day, remote_runs) values (me, (now() at time zone 'utc')::date, 0) on conflict do nothing;
  update public.playground_usage set remote_runs = remote_runs + p_units
   where user_id = me and day = (now() at time zone 'utc')::date and remote_runs + p_units <= lim
   returning remote_runs into used;
  if used is null then raise exception 'You have used today’s % server runs. Browser languages (HTML/CSS/JS, JavaScript, TypeScript, React, Python, SQL) are unlimited — or come back tomorrow.', lim using errcode = 'P0001'; end if;
  return lim - used;
end $$;

create or replace function public.playground_mark_solved(p_challenge text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into public.playground_solved (user_id, challenge_id) values (auth.uid(), p_challenge) on conflict do nothing;
end $$;

grant execute on function public.playground_consume(int), public.playground_mark_solved(text) to authenticated;
