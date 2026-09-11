-- Achilt Production V5.2 hardening
-- Safe to rerun. Does not delete orders/drivers/users.

create extension if not exists pgcrypto;
create extension if not exists postgis;

set search_path = public, extensions;

-- ---------- Columns / soft-delete / location freshness ----------
alter table public.drivers add column if not exists pin_hash text;
alter table public.drivers add column if not exists active boolean not null default true;
alter table public.drivers add column if not exists deleted_at timestamptz;
alter table public.drivers add column if not exists location geography(point,4326);
alter table public.drivers add column if not exists location_updated_at timestamptz;
alter table public.drivers alter column pin drop not null;

alter table public.users add column if not exists pin_hash text;
alter table public.users add column if not exists active boolean not null default true;
alter table public.users add column if not exists auth_user_id uuid;

alter table public.orders add column if not exists user_id uuid;

-- Hash existing plaintext driver PINs then remove plaintext.
update public.drivers
set pin_hash = crypt(pin, gen_salt('bf', 10)), pin = null
where pin_hash is null and pin is not null and length(pin) >= 4;

-- Keep geography in sync with legacy lat/lng columns.
create or replace function public.sync_driver_location()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := st_setsrid(st_makepoint(new.lng::double precision, new.lat::double precision),4326)::geography;
    if tg_op = 'INSERT' or old.lat is distinct from new.lat or old.lng is distinct from new.lng then
      new.location_updated_at := now();
    end if;
  else
    new.location := null;
  end if;
  return new;
end $$;

create or replace trigger drivers_sync_location
before insert or update of lat,lng on public.drivers
for each row execute function public.sync_driver_location();

update public.drivers
set location = st_setsrid(st_makepoint(lng::double precision, lat::double precision),4326)::geography,
    location_updated_at = coalesce(location_updated_at, now())
where lat is not null and lng is not null and location is null;

create index if not exists drivers_location_gix on public.drivers using gist(location);
create index if not exists drivers_active_available_car_idx on public.drivers(active, available, car_type);
create index if not exists drivers_location_fresh_idx on public.drivers(location_updated_at desc) where active = true and available = true;
create index if not exists orders_user_status_created_idx on public.orders(user_id,status,created_at desc);
create unique index if not exists users_auth_user_id_unique_idx on public.users(auth_user_id) where auth_user_id is not null;

-- ---------- Durable rate limits ----------
create table if not exists public.api_rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits integer not null default 0
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
begin
  insert into public.api_rate_limits(bucket,window_start,hits)
  values(p_bucket,v_now,1)
  on conflict (bucket) do nothing;

  select * into v_row from public.api_rate_limits where bucket=p_bucket for update;
  if v_row.window_start + make_interval(secs => p_window_seconds) <= v_now then
    update public.api_rate_limits set window_start=v_now,hits=1 where bucket=p_bucket;
    return true;
  end if;
  if v_row.hits >= p_limit then return false; end if;
  update public.api_rate_limits set hits=hits+1 where bucket=p_bucket;
  return true;
end $$;

-- ---------- Secure PIN helpers ----------
create or replace function public.verify_driver_pin(p_phone text, p_pin text)
returns uuid language sql security definer set search_path=public, extensions as $$
  select id from public.drivers
  where phone=p_phone and active=true and deleted_at is null
    and pin_hash is not null and pin_hash = crypt(p_pin,pin_hash)
  limit 1;
$$;

create or replace function public.verify_customer_pin(p_phone text, p_pin text)
returns uuid language sql security definer set search_path=public, extensions as $$
  select id from public.users
  where phone=p_phone and active=true
    and pin_hash is not null and pin_hash = crypt(p_pin,pin_hash)
  limit 1;
$$;

create or replace function public.register_customer_secure(p_phone text, p_pin text)
returns uuid language plpgsql security definer set search_path=public, extensions as $$
declare v_id uuid;
begin
  if p_phone is null or length(p_phone) < 8 or p_pin !~ '^[0-9]{4,8}$' then raise exception 'Invalid registration'; end if;
  select id into v_id from public.users where phone=p_phone limit 1;
  if v_id is not null then
    if exists(select 1 from public.users where id=v_id and pin_hash is not null) then raise exception 'Phone already registered'; end if;
    update public.users set pin_hash=crypt(p_pin,gen_salt('bf',10)), active=true where id=v_id;
    return v_id;
  end if;
  insert into public.users(phone,pin_hash,active) values(p_phone,crypt(p_pin,gen_salt('bf',10)),true) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_create_driver_secure(p_phone text,p_name text,p_pin text,p_car_type text default null)
returns uuid language plpgsql security definer set search_path=public, extensions as $$
declare v_id uuid;
begin
  if p_phone is null or length(p_phone)<8 or p_pin !~ '^[0-9]{4,8}$' then raise exception 'Invalid driver'; end if;
  if exists(select 1 from public.drivers where phone=p_phone and deleted_at is null) then raise exception 'Phone already exists'; end if;
  insert into public.drivers(phone,name,pin,pin_hash,car_type,available,active)
  values(p_phone,coalesce(nullif(p_name,''),'Шинэ жолооч'),null,crypt(p_pin,gen_salt('bf',10)),p_car_type,false,true)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_driver_pin_secure(p_driver_id uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'Invalid PIN'; end if;
  update public.drivers set pin_hash=crypt(p_pin,gen_salt('bf',10)), pin=null where id=p_driver_id and deleted_at is null;
  return found;
end $$;


-- Link a phone number that has already been verified by Supabase Auth OTP.
create or replace function public.upsert_customer_from_verified_phone(p_phone text, p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path=public, extensions as $$
declare v_id uuid; v_active boolean;
begin
  if p_phone is null or p_auth_user_id is null then raise exception 'Invalid verified phone'; end if;
  perform pg_advisory_xact_lock(hashtext(p_phone));
  select id,active into v_id,v_active from public.users where phone=p_phone order by id limit 1 for update;
  if v_id is not null then
    if not v_active then raise exception 'Account disabled'; end if;
    update public.users set auth_user_id=p_auth_user_id where id=v_id;
    return v_id;
  end if;
  insert into public.users(phone,auth_user_id,active) values(p_phone,p_auth_user_id,true) returning id into v_id;
  return v_id;
end $$;

-- ---------- Driver slot refresh using PostGIS + fresh GPS ----------
create or replace function public.refresh_order_driver_slots(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  v_order public.orders%rowtype;
  v_current integer := 0;
  v_needed integer := 0;
  v_inserted integer := 0;
  v_from geography(point,4326);
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then
    update public.driver_invites set status='rejected' where order_id=p_order_id and status in ('active','offered');
    return jsonb_build_object('inserted',0,'active_slots',0,'order_status',v_order.status);
  end if;
  if v_order.from_lat is null or v_order.from_lng is null then raise exception 'Order location missing'; end if;
  v_from := st_setsrid(st_makepoint(v_order.from_lng::double precision,v_order.from_lat::double precision),4326)::geography;

  update public.driver_invites di set status='offered',offered_at=coalesce(offered_at,now())
  where order_id=p_order_id and status='active' and exists(
    select 1 from public.offers o where o.order_id=di.order_id and o.driver_id=di.driver_id and o.status='pending'
  );

  update public.driver_invites di set status='expired'
  where order_id=p_order_id and status='active' and expires_at<=now()
    and not exists(select 1 from public.offers o where o.order_id=di.order_id and o.driver_id=di.driver_id and o.status='pending');

  select count(*) into v_current from public.driver_invites where order_id=p_order_id and status in ('active','offered');
  v_needed := greatest(0,5-v_current);

  if v_needed>0 then
    with base as (
      select coalesce(max(rank),0) base_rank from public.driver_invites where order_id=p_order_id
    ), candidates as (
      select d.id driver_id, row_number() over(order by st_distance(d.location,v_from),d.id) rn
      from public.drivers d
      where d.active=true and d.deleted_at is null and d.available=true
        and d.location is not null and d.location_updated_at >= now()-interval '2 minutes'
        and (v_order.car_type is null or d.car_type is null or d.car_type=v_order.car_type)
        and not exists(select 1 from public.driver_invites old where old.order_id=p_order_id and old.driver_id=d.id)
        and not exists(select 1 from public.orders busy where busy.driver_id=d.id and busy.status='confirmed')
      order by st_distance(d.location,v_from),d.id
      limit v_needed
    )
    insert into public.driver_invites(order_id,driver_id,rank,status,invited_at,expires_at)
    select p_order_id,c.driver_id,b.base_rank+c.rn::integer,'active',now(),now()+interval '60 seconds'
    from candidates c cross join base b on conflict(order_id,driver_id) do nothing;
    get diagnostics v_inserted=row_count;
  end if;

  select count(*) into v_current from public.driver_invites where order_id=p_order_id and status in ('active','offered');
  return jsonb_build_object('inserted',v_inserted,'active_slots',v_current,'order_status','pending');
end $$;

-- Refresh all due pending orders; intended for cron once/minute.
create or replace function public.refresh_due_order_slots()
returns integer language plpgsql security definer set search_path=public, extensions as $$
declare r record; n integer:=0;
begin
  for r in select distinct order_id from public.driver_invites where status='active' and expires_at<=now()
  loop
    perform public.refresh_order_driver_slots(r.order_id); n:=n+1;
  end loop;
  return n;
end $$;



-- ---------- Atomic driver offer submission ----------
-- Locks the order + invite while a driver quotes so a customer selection,
-- invite expiry/rotation, and a driver quote cannot race each other.
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

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found or v_order.status <> 'pending' then
    raise exception 'Order unavailable';
  end if;

  select * into v_driver
  from public.drivers
  where id=p_driver_id
    and active=true
    and deleted_at is null
    and available=true
  for update;
  if not found then
    raise exception 'Driver unavailable';
  end if;

  if v_order.car_type is not null and v_driver.car_type is not null and v_order.car_type <> v_driver.car_type then
    raise exception 'Vehicle type mismatch';
  end if;

  select * into v_invite
  from public.driver_invites
  where order_id=p_order_id
    and driver_id=p_driver_id
    and status in ('active','offered')
  for update;
  if not found then
    raise exception 'Invite unavailable';
  end if;

  if v_invite.status='active' and v_invite.expires_at <= now() then
    update public.driver_invites set status='expired' where id=v_invite.id;
    raise exception 'Invite expired';
  end if;

  if exists(select 1 from public.orders busy where busy.driver_id=p_driver_id and busy.status='confirmed' and busy.id<>p_order_id) then
    raise exception 'Driver already busy';
  end if;

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

-- ---------- Existing atomic selection, now owner-safe at API and driver-reservation-safe ----------
create or replace function public.select_customer_offer_atomic(p_order_id uuid,p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  v_order public.orders%rowtype;
  v_offer public.offers%rowtype;
  v_driver public.drivers%rowtype;
begin
  -- Serialize customer selection for this order.
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status<>'pending' then raise exception 'Order already selected'; end if;

  select * into v_offer
  from public.offers
  where id=p_offer_id and order_id=p_order_id and status='pending'
  for update;
  if not found then raise exception 'Offer not available'; end if;

  if not exists(
    select 1 from public.driver_invites
    where order_id=p_order_id and driver_id=v_offer.driver_id and status in ('active','offered')
  ) then raise exception 'Driver is no longer available'; end if;

  -- Lock the driver row too. This prevents two customers selecting the same driver concurrently.
  select * into v_driver
  from public.drivers
  where id=v_offer.driver_id and active=true and deleted_at is null
  for update;
  if not found or not v_driver.available then raise exception 'Driver is already busy'; end if;

  -- Only a currently confirmed trip blocks a driver. Historical completed trips must never block future work.
  if exists(
    select 1 from public.orders
    where driver_id=v_offer.driver_id and status='confirmed' and id<>p_order_id
  ) then raise exception 'Driver is already busy'; end if;

  update public.drivers set available=false where id=v_offer.driver_id;
  update public.orders
  set status='confirmed', driver_id=v_offer.driver_id, driver_name=v_offer.driver_name,
      driver_phone=v_offer.driver_phone, final_price=v_offer.price
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
returns jsonb language sql security definer set search_path=public, extensions as $$select public.select_customer_offer_atomic(p_order_id,p_offer_id);$$;

-- Complete using the selected offer/order final_price, never editable driver.price.
create or replace function public.complete_order_and_issue_payment(p_order_id uuid,p_driver_id uuid,p_amount numeric,p_duration_minutes integer)
returns table(code text) language plpgsql security definer set search_path=public, extensions as $$
declare v_order public.orders%rowtype; v_code text; v_amount numeric; i integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.driver_id is distinct from p_driver_id then raise exception 'Driver mismatch'; end if;
  if v_order.status not in ('confirmed','completed') then raise exception 'Order cannot be completed'; end if;
  v_amount:=coalesce(v_order.final_price,p_amount);
  if v_amount is null or v_amount<=0 then raise exception 'Payment amount missing'; end if;
  update public.orders set status='completed',completed_at=coalesce(completed_at,now()),duration_minutes=coalesce(duration_minutes,p_duration_minutes),final_price=v_amount where id=p_order_id;
  update public.drivers set available=false where id=p_driver_id;
  select pc.code into v_code from public.payment_codes pc where pc.order_id=p_order_id and pc.driver_id=p_driver_id and pc.used=false order by pc.id desc limit 1;
  if v_code is null then
    for i in 1..25 loop
      v_code:=lpad((floor(random()*900000)+100000)::int::text,6,'0');
      begin insert into public.payment_codes(driver_id,order_id,code,amount,used) values(p_driver_id,p_order_id,v_code,v_amount,false); exit;
      exception when unique_violation then v_code:=null; end;
    end loop;
    if v_code is null then raise exception 'Could not allocate payment code'; end if;
  end if;
  return query select v_code;
end $$;

create or replace function public.confirm_payment_atomic(p_payment_id uuid)
returns boolean language plpgsql security definer set search_path=public, extensions as $$
declare v_payment public.payment_codes%rowtype;
begin
  select * into v_payment from public.payment_codes where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.used then return true; end if;
  update public.payment_codes set used=true where id=p_payment_id;
  update public.drivers set available=true where id=v_payment.driver_id and active=true and deleted_at is null;
  return true;
end $$;

-- ---------- Lock browser access to sensitive tables ----------
do $$ declare t text; begin
  foreach t in array array['users','drivers','orders','offers','payment_codes','push_subscriptions','driver_invites','api_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;

-- settings is read/write only through admin API as well.
alter table public.settings enable row level security;
revoke all on table public.settings from public,anon,authenticated;
grant all on table public.settings to service_role;

-- Sensitive tables stay protected by RLS/revoked grants.
-- Realtime publication changes are intentionally omitted from this migration
-- to avoid destructive publication operations during production rollout.

-- Privileged functions only service_role.
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.verify_driver_pin(text,text) from public,anon,authenticated;
revoke all on function public.verify_customer_pin(text,text) from public,anon,authenticated;
revoke all on function public.register_customer_secure(text,text) from public,anon,authenticated;
revoke all on function public.upsert_customer_from_verified_phone(text,uuid) from public,anon,authenticated;
revoke all on function public.admin_create_driver_secure(text,text,text,text) from public,anon,authenticated;
revoke all on function public.set_driver_pin_secure(uuid,text) from public,anon,authenticated;
revoke all on function public.refresh_order_driver_slots(uuid) from public,anon,authenticated;
revoke all on function public.refresh_due_order_slots() from public,anon,authenticated;
revoke all on function public.submit_driver_offer_atomic(uuid,uuid,numeric,double precision,double precision) from public,anon,authenticated;
revoke all on function public.select_customer_offer_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.accept_offer_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_order_and_issue_payment(uuid,uuid,numeric,integer) from public,anon,authenticated;
revoke all on function public.confirm_payment_atomic(uuid) from public,anon,authenticated;

grant execute on all functions in schema public to service_role;
