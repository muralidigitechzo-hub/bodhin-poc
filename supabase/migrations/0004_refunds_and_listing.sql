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
