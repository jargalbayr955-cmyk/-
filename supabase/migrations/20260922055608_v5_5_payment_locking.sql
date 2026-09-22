-- Keep legacy payment history intact. Serialize order -> driver -> payment.
set lock_timeout = '5s';
create index if not exists payment_codes_order_id_idx on public.payment_codes(order_id);

create or replace function public.complete_order_and_issue_payment(p_order_id uuid,p_driver_id uuid,p_amount numeric,p_duration_minutes integer)
returns table(code text) language plpgsql security definer set search_path=public,extensions as $$
declare v_order public.orders%rowtype; v_payment public.payment_codes%rowtype; v_code text; i integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.driver_id is distinct from p_driver_id then raise exception 'Driver mismatch'; end if;
  if v_order.status not in ('confirmed','completed') then raise exception 'Order cannot be completed'; end if;
  perform 1 from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'Driver not found'; end if;
  if (select count(*) from public.payment_codes pc where pc.order_id=p_order_id)>1 then
    raise exception 'Multiple payment records require administrator review';
  end if;
  select * into v_payment from public.payment_codes pc where pc.order_id=p_order_id;
  if found then
    if v_payment.driver_id is distinct from p_driver_id then raise exception 'Payment driver mismatch'; end if;
    if v_order.status<>'completed' then raise exception 'Payment state requires administrator review'; end if;
    return query select v_payment.code; return;
  end if;
  if v_order.status='completed' then raise exception 'Completed order missing payment; administrator review required'; end if;
  if v_order.final_price is null or v_order.final_price<=0 then raise exception 'Payment amount missing'; end if;
  -- The selected offer is authoritative, never the request's p_amount.
  update public.orders set status='completed',completed_at=coalesce(completed_at,now()),
    duration_minutes=coalesce(duration_minutes,greatest(0,p_duration_minutes)) where id=p_order_id;
  update public.drivers set available=false where id=p_driver_id;
  for i in 1..25 loop
    v_code:=lpad((floor(random()*900000)+100000)::int::text,6,'0');
    begin
      insert into public.payment_codes(driver_id,order_id,code,amount,used)
      values(p_driver_id,p_order_id,v_code,v_order.final_price,false);
      exit;
    exception when unique_violation then v_code:=null;
    end;
  end loop;
  if v_code is null then raise exception 'Could not allocate payment code'; end if;
  return query select v_code;
end $$;

create or replace function public.confirm_payment_atomic(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v_payment public.payment_codes%rowtype; v_order public.orders%rowtype;
begin
  select * into v_payment from public.payment_codes where id=p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;
  if not found or v_order.status<>'completed' then raise exception 'Payment order unavailable'; end if;
  perform 1 from public.drivers where id=v_payment.driver_id for update;
  if not found then raise exception 'Payment driver unavailable'; end if;
  select * into v_payment from public.payment_codes where id=p_payment_id for update;
  if v_payment.used then return true; end if;
  if v_order.driver_id is distinct from v_payment.driver_id or v_order.final_price is distinct from v_payment.amount then
    raise exception 'Payment does not match completed order';
  end if;
  if (select count(*) from public.payment_codes where order_id=v_payment.order_id)>1 then
    raise exception 'Multiple payment records require administrator review';
  end if;
  update public.payment_codes set used=true where id=p_payment_id;
  update public.drivers d set available=(
    d.active and d.deleted_at is null and d.car_type in ('butten','chiregch')
    and not exists(select 1 from public.orders o where o.driver_id=d.id and o.status='confirmed')
    and not exists(select 1 from public.payment_codes pc where pc.driver_id=d.id and pc.used is not true)
  ) where d.id=v_payment.driver_id;
  return true;
end $$;

-- Serialize even direct service-side payment inserts; historical duplicates remain for review.
create or replace function public.guard_order_payment_insert()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.order_id is not null then
    perform 1 from public.orders where id=new.order_id for update;
    if not found then raise exception 'Payment order missing' using errcode='23503'; end if;
    if exists(select 1 from public.payment_codes where order_id=new.order_id) then
      raise exception 'Payment already exists for this order' using errcode='23505';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_order_payment_insert on public.payment_codes;
create trigger guard_order_payment_insert before insert on public.payment_codes
for each row execute function public.guard_order_payment_insert();

-- UPDATE already holds the driver row lock. Recheck work inside that lock.
create or replace function public.guard_driver_online()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.available is true and (
    not new.active or new.deleted_at is not null or coalesce(new.car_type,'') not in ('butten','chiregch')
    or exists(select 1 from public.orders where driver_id=new.id and status='confirmed')
    or exists(select 1 from public.payment_codes where driver_id=new.id and used is not true)
  ) then raise exception 'Driver has blocking work or incomplete profile' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists guard_driver_online on public.drivers;
create trigger guard_driver_online before update of available on public.drivers
for each row execute function public.guard_driver_online();

revoke all on function public.complete_order_and_issue_payment(uuid,uuid,numeric,integer),
  public.confirm_payment_atomic(uuid),public.guard_order_payment_insert(),public.guard_driver_online()
from public,anon,authenticated;
grant execute on function public.complete_order_and_issue_payment(uuid,uuid,numeric,integer),
  public.confirm_payment_atomic(uuid) to service_role;

-- Preserve nearest eight / ten-minute flow, exclude unpaid or incomplete drivers.
create or replace function public.refresh_order_driver_slots(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_from geography(point,4326);
  v_inserted integer := 0;
  v_active integer := 0;
  v_expires timestamptz;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;

  if v_order.status <> 'pending' then
    update public.driver_invites
    set status = 'rejected'
    where order_id = p_order_id and status in ('active','offered');
    return jsonb_build_object(
      'inserted',0,'active_slots',0,'order_status',v_order.status,
      'expired',true,'bidding_expires_at',v_order.bidding_expires_at
    );
  end if;

  if v_order.from_lat is null or v_order.from_lng is null then
    raise exception 'Order location missing';
  end if;

  -- First call only: freeze this search's candidate set at the nearest 8 drivers.
  if v_order.driver_invites_initialized_at is null then
    v_expires := now() + interval '10 minutes';
    update public.orders
    set driver_invites_initialized_at = now(),
        bidding_expires_at = v_expires
    where id = p_order_id;

    v_from := st_setsrid(
      st_makepoint(v_order.from_lng::double precision, v_order.from_lat::double precision),4326
    )::geography;

    insert into public.driver_invites(order_id,driver_id,rank,status,invited_at,expires_at)
    select p_order_id,
           d.id,
           row_number() over(order by st_distance(d.location,v_from),d.id)::integer,
           'active',
           now(),
           v_expires
    from public.drivers d
    where d.active = true
      and d.deleted_at is null
      and d.available = true
      and d.location is not null
      and d.location_updated_at >= now() - interval '2 minutes'
      and d.car_type in ('butten','chiregch')
      and (v_order.car_type is null or d.car_type = v_order.car_type)
      and not exists(select 1 from public.payment_codes pc where pc.driver_id=d.id and pc.used is not true)
      and not exists(
        select 1 from public.orders busy
        where busy.driver_id = d.id and busy.status = 'confirmed'
      )
    order by st_distance(d.location,v_from),d.id
    limit 8
    on conflict(order_id,driver_id) do nothing;

    get diagnostics v_inserted = row_count;
  else
    v_expires := v_order.bidding_expires_at;
  end if;

  -- Absolute ten-minute deadline. Offered drivers are closed too if customer did not choose in time.
  if v_expires is not null and now() >= v_expires then
    update public.driver_invites
    set status = 'expired'
    where order_id = p_order_id and status in ('active','offered');

    update public.offers
    set status = 'declined'
    where order_id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'inserted',v_inserted,'active_slots',0,'order_status','pending',
      'expired',true,'bidding_expires_at',v_expires
    );
  end if;

  -- Keep status in sync for drivers who already quoted. No replacements are ever inserted.
  update public.driver_invites di
  set status = 'offered', offered_at = coalesce(di.offered_at,now())
  where di.order_id = p_order_id
    and di.status = 'active'
    and exists(
      select 1 from public.offers o
      where o.order_id = di.order_id
        and o.driver_id = di.driver_id
        and o.status = 'pending'
    );

  select count(*) into v_active
  from public.driver_invites
  where order_id = p_order_id and status in ('active','offered');

  return jsonb_build_object(
    'inserted',v_inserted,'active_slots',v_active,'order_status','pending',
    'expired',false,'bidding_expires_at',v_expires
  );
end $$;

create or replace function public.submit_driver_offer_atomic(
  p_order_id uuid,
  p_driver_id uuid,
  p_price numeric,
  p_driver_lat double precision default null,
  p_driver_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_driver public.drivers%rowtype;
  v_invite public.driver_invites%rowtype;
  v_offer_id uuid;
begin
  if p_price is null or p_price <= 0 or p_price > 10000000 then
    raise exception 'Invalid offer price';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status <> 'pending' then raise exception 'Order unavailable'; end if;
  if v_order.bidding_expires_at is null or now() >= v_order.bidding_expires_at then
    update public.driver_invites set status='expired'
      where order_id=p_order_id and status in ('active','offered');
    update public.offers set status='declined'
      where order_id=p_order_id and status='pending';
    raise exception 'Invite expired';
  end if;

  select * into v_driver
  from public.drivers
  where id=p_driver_id and active=true and deleted_at is null and available=true
  for update;
  if not found then raise exception 'Driver unavailable'; end if;

  if v_order.car_type is not null and v_driver.car_type is not null and v_order.car_type <> v_driver.car_type then
    raise exception 'Vehicle type mismatch';
  end if;

  select * into v_invite
  from public.driver_invites
  where order_id=p_order_id and driver_id=p_driver_id and status in ('active','offered')
  for update;
  if not found then raise exception 'Invite unavailable'; end if;
  if now() >= v_invite.expires_at then
    update public.driver_invites set status='expired' where id=v_invite.id;
    raise exception 'Invite expired';
  end if;

  if exists(
    select 1 from public.orders busy
    where busy.driver_id=p_driver_id and busy.status='confirmed' and busy.id<>p_order_id
  ) then raise exception 'Driver already busy'; end if;

  if coalesce(v_driver.car_type,'') not in ('butten','chiregch') or exists(
    select 1 from public.payment_codes where driver_id=v_driver.id and used is not true
  ) then raise exception 'Driver unavailable'; end if;

  insert into public.offers(
    order_id,driver_id,driver_name,driver_phone,car_type,price,status,driver_lat,driver_lng
  ) values(
    v_order.id,v_driver.id,v_driver.name,v_driver.phone,v_driver.car_type,round(p_price),'pending',
    coalesce(p_driver_lat,v_driver.lat::double precision),coalesce(p_driver_lng,v_driver.lng::double precision)
  )
  on conflict(order_id,driver_id) do update
  set price=excluded.price,
      driver_name=excluded.driver_name,
      driver_phone=excluded.driver_phone,
      car_type=excluded.car_type,
      driver_lat=excluded.driver_lat,
      driver_lng=excluded.driver_lng,
      status='pending'
  returning id into v_offer_id;

  update public.driver_invites
  set status='offered', offered_at=coalesce(offered_at,now())
  where id=v_invite.id;

  return jsonb_build_object('offer_id',v_offer_id,'order_id',v_order.id,'driver_id',v_driver.id,'price',round(p_price));
end $$;

create or replace function public.select_customer_offer_atomic(p_order_id uuid,p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_offer public.offers%rowtype;
  v_driver public.drivers%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then raise exception 'Order already selected'; end if;
  if v_order.bidding_expires_at is null or now() >= v_order.bidding_expires_at then
    update public.driver_invites set status='expired'
      where order_id=p_order_id and status in ('active','offered');
    update public.offers set status='declined'
      where order_id=p_order_id and status='pending';
    raise exception 'Bidding expired';
  end if;

  select * into v_offer
  from public.offers
  where id=p_offer_id and order_id=p_order_id and status='pending'
  for update;
  if not found then raise exception 'Offer not available'; end if;

  if not exists(
    select 1 from public.driver_invites
    where order_id=p_order_id and driver_id=v_offer.driver_id and status in ('active','offered')
  ) then raise exception 'Driver is no longer available'; end if;

  select * into v_driver
  from public.drivers
  where id=v_offer.driver_id and active=true and deleted_at is null
  for update;
  if not found or not v_driver.available then raise exception 'Driver is already busy'; end if;

  if exists(
    select 1 from public.orders
    where driver_id=v_offer.driver_id and status='confirmed' and id<>p_order_id
  ) then raise exception 'Driver is already busy'; end if;

  if coalesce(v_driver.car_type,'') not in ('butten','chiregch') or exists(
    select 1 from public.payment_codes where driver_id=v_driver.id and used is not true
  ) then raise exception 'Driver unavailable'; end if;

  update public.drivers set available=false where id=v_offer.driver_id;
  update public.orders
  set status='confirmed',driver_id=v_offer.driver_id,driver_name=v_offer.driver_name,
      driver_phone=v_offer.driver_phone,final_price=v_offer.price
  where id=p_order_id;
  update public.offers
  set status=case when id=p_offer_id then 'accepted' else 'declined' end
  where order_id=p_order_id and status='pending';
  update public.driver_invites
  set status=case when driver_id=v_offer.driver_id then 'selected' else 'rejected' end
  where order_id=p_order_id and status in ('active','offered');

  return jsonb_build_object('order_id',p_order_id,'driver_id',v_offer.driver_id,'offer_id',p_offer_id,'price',v_offer.price);
end $$;
