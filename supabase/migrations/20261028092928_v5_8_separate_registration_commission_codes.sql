create or replace function public.complete_order_and_issue_commission(p_order_id uuid, p_driver_id uuid, p_duration_minutes integer)
returns table(code text, amount numeric, fare_amount numeric, paid boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payment_codes%rowtype;
  v_code text;
  v_fee numeric;
  i integer;
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
    return query select v_payment.code, v_payment.amount::numeric, coalesce(v_payment.fare_amount,v_order.final_price), v_payment.used is true;
    return;
  end if;
  if v_order.status='completed' or v_order.final_price is null or v_order.final_price<=0 then raise exception 'Payment unavailable'; end if;
  v_fee:=public.driver_commission(v_order.final_price);
  update public.orders set status='completed',completed_at=coalesce(completed_at,now()),
    duration_minutes=coalesce(duration_minutes,greatest(0,p_duration_minutes)) where id=p_order_id;
  update public.drivers set available=false where id=p_driver_id;
  for i in 1..25 loop
    v_code:=lpad((floor(random()*900000)+100000)::integer::text,6,'0');
    if exists(select 1 from public.driver_registration_requests r where r.payment_code=v_code) then
      v_code:=null;
      continue;
    end if;
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
