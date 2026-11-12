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
