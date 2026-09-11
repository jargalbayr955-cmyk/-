-- Achilt Production V5.3
-- Business rule: choose the nearest 8 available drivers once, keep a 10-minute bidding window,
-- never rotate/replenish drivers, and allow the customer to start a fresh search after expiry.
-- Safe to run after V5.2. Does not delete users, drivers, orders, or payment history.

set search_path = public, extensions;

alter table public.orders add column if not exists driver_invites_initialized_at timestamptz;
alter table public.orders add column if not exists bidding_expires_at timestamptz;
create index if not exists orders_bidding_expires_idx
  on public.orders (bidding_expires_at)
  where status = 'pending';

-- Existing pending searches become a fixed 10-minute window based on their original creation time.
update public.orders
set driver_invites_initialized_at = coalesce(driver_invites_initialized_at, created_at),
    bidding_expires_at = coalesce(bidding_expires_at, created_at + interval '10 minutes')
where status = 'pending';

-- Re-purpose the existing RPC name so old application calls remain compatible.
-- It initializes exactly once. Subsequent calls only close the window when it expires.
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
      and (v_order.car_type is null or d.car_type is null or d.car_type = v_order.car_type)
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

-- No minute cron is needed in V5.3. Expiry is enforced atomically on every relevant request.
create or replace function public.refresh_due_order_slots()
returns integer
language sql
security definer
set search_path=public, extensions
as $$ select 0::integer; $$;

-- A driver can quote only if they were in the frozen nearest-8 set and the 10-minute window is still open.
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

-- Customer selection is also bounded by the same ten-minute window.
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

create or replace function public.accept_offer_atomic(p_order_id uuid,p_offer_id uuid)
returns jsonb
language sql
security definer
set search_path=public, extensions
as $$ select public.select_customer_offer_atomic(p_order_id,p_offer_id); $$;

revoke all on function public.refresh_order_driver_slots(uuid) from public,anon,authenticated;
revoke all on function public.refresh_due_order_slots() from public,anon,authenticated;
revoke all on function public.submit_driver_offer_atomic(uuid,uuid,numeric,double precision,double precision) from public,anon,authenticated;
revoke all on function public.select_customer_offer_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.accept_offer_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.refresh_order_driver_slots(uuid) to service_role;
grant execute on function public.refresh_due_order_slots() to service_role;
grant execute on function public.submit_driver_offer_atomic(uuid,uuid,numeric,double precision,double precision) to service_role;
grant execute on function public.select_customer_offer_atomic(uuid,uuid) to service_role;
grant execute on function public.accept_offer_atomic(uuid,uuid) to service_role;
