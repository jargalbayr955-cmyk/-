set lock_timeout = '5s';

alter table public.payment_codes
  add column if not exists fee_policy text not null default 'legacy_fare',
  add column if not exists fare_amount numeric,
  add column if not exists approved_via text;

-- Five percent, rounded to the nearest 500 MNT. Exact half steps round upward.
create or replace function public.driver_commission(p_fare numeric)
returns numeric language sql immutable strict security invoker set search_path = '' as $$
  select round(p_fare / 10000) * 500;
$$;
revoke all on function public.driver_commission(numeric) from public, anon, authenticated;
grant execute on function public.driver_commission(numeric) to service_role;

-- Paid history is immutable. Convert only unambiguous outstanding full-fare charges.
update public.payment_codes p set amount = public.driver_commission(o.final_price),
  fare_amount = o.final_price, fee_policy = 'commission_5pct_500'
from public.orders o
where o.id = p.order_id and o.driver_id = p.driver_id and o.status = 'completed'
  and p.used is not true and p.fee_policy = 'legacy_fare' and p.amount = o.final_price and o.final_price > 0
  and (select count(*) from public.payment_codes other where other.order_id = o.id) = 1;

-- A rounded zero fee is waived, never silently increased to 500 MNT.
update public.payment_codes set used = true, approved_at = now(), approved_via = 'zero_fee'
where used is not true and fee_policy = 'commission_5pct_500' and amount = 0;
update public.drivers d set available = (
  d.active is true and d.deleted_at is null and coalesce(d.car_type, '') in ('butten', 'chiregch')
  and not exists(select 1 from public.orders o where o.driver_id = d.id and o.status = 'confirmed')
  and not exists(select 1 from public.payment_codes p where p.driver_id = d.id and p.used is not true)
) where d.id in (select driver_id from public.payment_codes where approved_via='zero_fee' and approved_at=now());

-- An old deployment would display a full-fare amount. Make it retry after upgrading.
create or replace function public.complete_order_and_issue_payment(p_order_id uuid,p_driver_id uuid,p_amount numeric,p_duration_minutes integer)
returns table(code text) language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Payment flow updated. Refresh the page.' using errcode = '42501'; end;
$$;
revoke all on function public.complete_order_and_issue_payment(uuid,uuid,numeric,integer) from public,anon,authenticated,service_role;

create or replace function public.complete_order_and_issue_commission(p_order_id uuid,p_driver_id uuid,p_duration_minutes integer)
returns table(code text, amount numeric, fare_amount numeric, paid boolean)
language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment public.payment_codes%rowtype; v_code text; v_fee numeric; i integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.driver_id is distinct from p_driver_id or v_order.status not in ('confirmed','completed') then
    raise exception 'Order unavailable';
  end if;
  perform 1 from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'Driver unavailable'; end if;
  if (select count(*) from public.payment_codes p where p.order_id=p_order_id)>1 then raise exception 'Multiple payment records require administrator review'; end if;
  select * into v_payment from public.payment_codes p where p.order_id=p_order_id;
  if found then
    if v_payment.driver_id is distinct from p_driver_id or v_order.status<>'completed' then raise exception 'Payment requires administrator review'; end if;
    return query select v_payment.code, v_payment.amount::numeric, coalesce(v_payment.fare_amount,v_order.final_price), v_payment.used is true; return;
  end if;
  if v_order.status='completed' or v_order.final_price is null or v_order.final_price<=0 then raise exception 'Payment unavailable'; end if;
  v_fee:=public.driver_commission(v_order.final_price);
  update public.orders set status='completed',completed_at=coalesce(completed_at,now()),
    duration_minutes=coalesce(duration_minutes,greatest(0,p_duration_minutes)) where id=p_order_id;
  update public.drivers set available=false where id=p_driver_id;
  for i in 1..25 loop
    v_code:=lpad((floor(random()*900000)+100000)::integer::text,6,'0');
    begin
      insert into public.payment_codes(driver_id,order_id,code,amount,used,fee_policy,fare_amount,approved_at,approved_via)
      values(p_driver_id,p_order_id,v_code,v_fee,v_fee=0,'commission_5pct_500',v_order.final_price,
        case when v_fee=0 then now() end,case when v_fee=0 then 'zero_fee' end);
      exit;
    exception when unique_violation then v_code:=null;
    end;
  end loop;
  if v_code is null then raise exception 'Could not allocate payment code'; end if;
  if v_fee=0 then
    update public.drivers d set available=(d.active is true and d.deleted_at is null and coalesce(d.car_type,'') in ('butten','chiregch')
      and not exists(select 1 from public.orders o where o.driver_id=d.id and o.status='confirmed')
      and not exists(select 1 from public.payment_codes p where p.driver_id=d.id and p.used is not true)) where d.id=p_driver_id;
  end if;
  return query select v_code,v_fee,v_order.final_price::numeric,v_fee=0;
end $$;
revoke all on function public.complete_order_and_issue_commission(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_order_and_issue_commission(uuid,uuid,integer) to service_role;

create or replace function public.confirm_driver_commission(p_code text,p_amount numeric)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_payment public.payment_codes%rowtype; v_order public.orders%rowtype; v_available boolean; v_pending bigint;
begin
  if p_code is null or p_code !~ '^[0-9]{6}$' or p_amount is null or p_amount<=0 or p_amount<>trunc(p_amount) then raise exception 'Invalid receipt' using errcode='22023'; end if;
  select * into v_payment from public.payment_codes where code=p_code;
  if not found then raise exception 'Unknown payment code' using errcode='P0002'; end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;
  if not found or v_order.status is distinct from 'completed' then raise exception 'Payment order unavailable'; end if;
  perform 1 from public.drivers where id=v_order.driver_id for update;
  if not found then raise exception 'Payment driver unavailable'; end if;
  select * into v_payment from public.payment_codes where code=p_code for update;
  if v_payment.driver_id is distinct from v_order.driver_id or (select count(*) from public.payment_codes where order_id=v_order.id)<>1 then raise exception 'Payment mismatch'; end if;
  -- Compare again inside the transaction, never trust a preflight lookup or browser amount.
  if v_payment.amount is distinct from p_amount then raise exception 'Payment amount mismatch'; end if;
  if v_payment.used is not true then
    if v_payment.fee_policy<>'commission_5pct_500' or v_payment.fare_amount is distinct from v_order.final_price
      or v_payment.amount is distinct from public.driver_commission(v_order.final_price) then raise exception 'Commission mismatch'; end if;
    update public.payment_codes set used=true,approved_at=now(),approved_via='macrodroid',approved_by_session_version=null where id=v_payment.id;
    update public.drivers d set available=(d.active is true and d.deleted_at is null and coalesce(d.car_type,'') in ('butten','chiregch')
      and not exists(select 1 from public.orders o where o.driver_id=d.id and o.status='confirmed')
      and not exists(select 1 from public.payment_codes p where p.driver_id=d.id and p.used is not true)) where d.id=v_order.driver_id;
  end if;
  select available into v_available from public.drivers where id=v_order.driver_id;
  select count(*) into v_pending from public.payment_codes where driver_id=v_order.driver_id and used is not true;
  return jsonb_build_object('success',true,'already_confirmed',v_payment.used is true,'available',v_available,'pending_payments',v_pending);
end $$;
revoke all on function public.confirm_driver_commission(text,numeric) from public,anon,authenticated;
grant execute on function public.confirm_driver_commission(text,numeric) to service_role;

-- Retain manual review as a fallback, with the same current-session and row locks.
create or replace function public.admin_approve_driver_payment(p_order_id uuid,p_session_version uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment public.payment_codes%rowtype; v_available boolean; v_pending bigint; v_expected numeric;
begin
  perform 1 from public.admin_credentials where id=1 and session_version=p_session_version and not must_change_password for share;
  if not found then raise exception 'Administrator session expired' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status is distinct from 'completed' or v_order.driver_id is null then raise exception 'Payment order unavailable'; end if;
  perform 1 from public.drivers where id=v_order.driver_id for update;
  if not found then raise exception 'Payment driver unavailable'; end if;
  if (select count(*) from public.payment_codes where order_id=p_order_id)<>1 then raise exception 'Payment record requires administrator review'; end if;
  select * into v_payment from public.payment_codes where order_id=p_order_id for update;
  v_expected:=case when v_payment.fee_policy='commission_5pct_500' then public.driver_commission(v_order.final_price) else v_order.final_price end;
  if v_payment.driver_id is distinct from v_order.driver_id or v_payment.amount is distinct from v_expected then raise exception 'Payment does not match completed order'; end if;
  if v_payment.used is not true then
    update public.payment_codes set used=true,approved_at=now(),approved_via='admin',approved_by_session_version=p_session_version where id=v_payment.id;
    update public.drivers d set available=(d.active is true and d.deleted_at is null and coalesce(d.car_type,'') in ('butten','chiregch')
      and not exists(select 1 from public.orders o where o.driver_id=d.id and o.status='confirmed')
      and not exists(select 1 from public.payment_codes p where p.driver_id=d.id and p.used is not true)) where d.id=v_order.driver_id;
  end if;
  select available into v_available from public.drivers where id=v_order.driver_id;
  select count(*) into v_pending from public.payment_codes where driver_id=v_order.driver_id and used is not true;
  return jsonb_build_object('approved',true,'already_approved',v_payment.used is true,'available',v_available,'pending_payments',v_pending);
end $$;
revoke all on function public.admin_approve_driver_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_approve_driver_payment(uuid,uuid) to service_role;

-- Search the whole unpaid queue before pagination; never filter only the dashboard's first 200 rows.
create or replace function public.admin_search_driver_payments(p_search text default '', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (
    select regexp_replace(upper(left(coalesce(p_search, ''), 40)), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g') as value
  ), matches as (
    select o.id, pc.driver_id, coalesce(d.name, o.driver_name)::text as driver_name,
      coalesce(d.phone, o.driver_phone)::text as driver_phone, d.car_number,
      o.from_address, o.to_address, pc.code, pc.amount, pc.fare_amount, o.completed_at
    from public.payment_codes pc
    join public.orders o on o.id = pc.order_id
    left join public.drivers d on d.id = pc.driver_id
    cross join term t
    where pc.used is not true and o.status = 'completed'
      and (btrim(coalesce(p_search, '')) = '' or (t.value <> '' and (
        position(t.value in regexp_replace(upper(coalesce(d.car_number, '')), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g')) > 0
        or position(t.value in regexp_replace(coalesce(d.phone, o.driver_phone, ''), '[^0-9]', '', 'g')) > 0
      )))
  ), page as (
    select * from matches order by completed_at asc nulls last, id
    limit 50 offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object('payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.completed_at asc nulls last, p.id) from page p), '[]'::jsonb),
    'total', (select count(*) from matches));
$$;
revoke all on function public.admin_search_driver_payments(text, integer) from public, anon, authenticated;
grant execute on function public.admin_search_driver_payments(text, integer) to service_role;
