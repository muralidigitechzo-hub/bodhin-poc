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
