-- Unifies customer and driver dispatch around six top-level service types.
-- Existing data is preserved as towing (achilt); towing keeps butten/chiregch as a subtype.

alter table public.drivers add column if not exists service_type text;
update public.drivers set service_type='achilt' where service_type is null;
alter table public.drivers alter column service_type set default 'achilt';
alter table public.drivers alter column service_type set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.drivers'::regclass and conname='drivers_service_type_check') then
    alter table public.drivers add constraint drivers_service_type_check check (service_type in ('achilt','crane','excavator','car_start','bobcat','loader'));
  end if;
end $$;

alter table public.orders add column if not exists service_type text;
update public.orders set service_type='achilt' where service_type is null;
alter table public.orders alter column service_type set default 'achilt';
alter table public.orders alter column service_type set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_service_type_check') then
    alter table public.orders add constraint orders_service_type_check check (service_type in ('achilt','crane','excavator','car_start','bobcat','loader'));
  end if;
end $$;

alter table public.driver_registration_requests add column if not exists service_type text;
update public.driver_registration_requests set service_type='achilt' where service_type is null;
alter table public.driver_registration_requests alter column service_type set default 'achilt';
alter table public.driver_registration_requests alter column service_type set not null;
alter table public.driver_registration_requests alter column car_type drop not null;
alter table public.driver_registration_requests drop constraint if exists driver_registration_requests_car_type_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.driver_registration_requests'::regclass and conname='driver_registration_requests_service_type_check') then
    alter table public.driver_registration_requests add constraint driver_registration_requests_service_type_check check (service_type in ('achilt','crane','excavator','car_start','bobcat','loader'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.driver_registration_requests'::regclass and conname='driver_registration_requests_service_vehicle_check') then
    alter table public.driver_registration_requests add constraint driver_registration_requests_service_vehicle_check check ((service_type='achilt' and car_type in ('butten','chiregch')) or (service_type<>'achilt' and car_type is null));
  end if;
end $$;

create index if not exists drivers_service_dispatch_idx on public.drivers(service_type,car_type,available,active) where deleted_at is null;

create or replace function public.start_driver_registration_v3(
  p_phone text,
  p_service_type text,
  p_car_type text,
  p_name text,
  p_photo_data_url text default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_driver public.drivers%rowtype;
  v_driver_id uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_existing_request boolean := false;
  v_car_type text := case when p_service_type='achilt' then p_car_type else null end;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$'
     or p_service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
     or (p_service_type='achilt' and p_car_type not in ('butten','chiregch'))
     or (p_service_type<>'achilt' and nullif(coalesce(p_car_type,''),'') is not null)
     or char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'Invalid driver registration' using errcode='22023';
  end if;

  if p_photo_data_url is not null and (
      octet_length(p_photo_data_url) > 300000
      or p_photo_data_url !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  ) then
    raise exception 'Invalid driver photo' using errcode='22023';
  end if;

  select * into v_request
  from public.driver_registration_requests
  where phone=p_phone
  for update;
  v_existing_request := found;

  if v_existing_request and v_request.status <> 'awaiting_payment' then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  v_driver_id := null;
  if v_existing_request and v_request.driver_id is not null then
    select * into v_driver
    from public.drivers
    where id=v_request.driver_id and deleted_at is null
    for update;

    if found then
      if v_driver.active then
        raise exception 'Driver phone already exists' using errcode='23505';
      end if;
      v_driver_id := v_driver.id;
      update public.drivers
      set phone=p_phone,
          name=v_name,
          pin=null,
          pin_hash=extensions.crypt('000000',extensions.gen_salt('bf',10)),
          service_type=p_service_type,
          car_type=v_car_type,
          car_number=null,
          photo_url=p_photo_data_url,
          price=null,
          lat=null,
          lng=null,
          location=null,
          location_updated_at=null,
          available=false,
          is_online=false,
          active=false,
          session_version=pg_catalog.gen_random_uuid()
      where id=v_driver_id;
    end if;
  end if;

  if v_driver_id is null then
    select d.id into v_driver_id
    from public.drivers d
    where d.deleted_at is null
      and pg_catalog.regexp_replace(d.phone,'[^0-9]','','g')=pg_catalog.regexp_replace(p_phone,'[^0-9]','','g')
    limit 1
    for update;

    if found then
      raise exception 'Driver phone already exists' using errcode='23505';
    end if;

    insert into public.drivers(
      phone,name,pin,pin_hash,service_type,car_type,car_number,photo_url,
      available,is_online,active,session_version
    ) values (
      p_phone,v_name,null,extensions.crypt('000000',extensions.gen_salt('bf',10)),
      p_service_type,v_car_type,null,p_photo_data_url,false,false,false,pg_catalog.gen_random_uuid()
    ) returning id into v_driver_id;
  end if;

  if v_existing_request then
    update public.driver_registration_requests
    set service_type=p_service_type,
        car_type=v_car_type,
        driver_name=v_name,
        photo_data_url=p_photo_data_url,
        status='awaiting_payment',
        payment_code=null,
        amount_due=25000,
        payment_amount=null,
        payment_confirmed_at=null,
        driver_id=v_driver_id,
        pin_set_at=null,
        expires_at=pg_catalog.now()+interval '24 hours',
        updated_at=pg_catalog.now()
    where id=v_request.id
    returning * into v_request;
  else
    insert into public.driver_registration_requests(
      phone,service_type,car_type,driver_name,photo_data_url,status,
      payment_code,amount_due,driver_id,expires_at
    ) values (
      p_phone,p_service_type,v_car_type,v_name,p_photo_data_url,'awaiting_payment',
      null,25000,v_driver_id,pg_catalog.now()+interval '24 hours'
    ) returning * into v_request;
  end if;

  return jsonb_build_object(
    'request_id',v_request.id,
    'status','awaiting_payment',
    'amount_due',25000,
    'driver_id',v_driver_id,
    'service_type',p_service_type,
    'car_type',v_car_type,
    'manual_payment',true,
    'expires_at',v_request.expires_at
  );
end $$;

create or replace function public.start_driver_registration_v2(p_phone text,p_car_type text,p_name text,p_photo_data_url text default null)
returns jsonb language sql set search_path=''
as $$ select public.start_driver_registration_v3(p_phone,'achilt',p_car_type,p_name,p_photo_data_url); $$;

create or replace function public.complete_admin_driver_onboarding_v2(
  p_driver_id uuid,
  p_name text,
  p_car_number text,
  p_pin text,
  p_service_type text,
  p_car_type text default null
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_driver public.drivers%rowtype;
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_car_number text := pg_catalog.btrim(coalesce(p_car_number,''));
  v_car_type text := case when p_service_type='achilt' then p_car_type else null end;
begin
  if p_driver_id is null
     or char_length(v_name) < 1 or char_length(v_name) > 100
     or char_length(v_car_number) < 1 or char_length(v_car_number) > 30
     or p_pin is null or p_pin !~ '^[0-9]{6}$' or p_pin='000000'
     or p_service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
     or (p_service_type='achilt' and p_car_type not in ('butten','chiregch'))
     or (p_service_type<>'achilt' and nullif(coalesce(p_car_type,''),'') is not null)
  then raise exception 'Invalid driver onboarding' using errcode='22023'; end if;

  select * into v_driver from public.drivers
  where id=p_driver_id and active=true and deleted_at is null
  for update;
  if not found then raise exception 'Driver not found' using errcode='P0002'; end if;

  if coalesce(pg_catalog.btrim(v_driver.name),'')<>''
     and pg_catalog.btrim(v_driver.name)<>'Шинэ жолооч'
     and coalesce(pg_catalog.btrim(v_driver.car_number),'')<>'' then
    raise exception 'Driver onboarding already completed' using errcode='P0001';
  end if;

  update public.drivers
  set name=v_name,
      car_number=v_car_number,
      service_type=p_service_type,
      car_type=v_car_type,
      pin=null,
      pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),
      available=false,
      session_version=pg_catalog.gen_random_uuid()
  where id=p_driver_id
  returning * into v_driver;

  return jsonb_build_object(
    'driver',jsonb_build_object(
      'id',v_driver.id,'name',v_driver.name,'phone',v_driver.phone,
      'service_type',v_driver.service_type,'car_type',v_driver.car_type,
      'car_number',v_driver.car_number,'photo_url',v_driver.photo_url,
      'price',v_driver.price,'available',v_driver.available,'active',v_driver.active,
      'lat',v_driver.lat,'lng',v_driver.lng,'location_updated_at',v_driver.location_updated_at
    ),
    'session_version',v_driver.session_version
  );
end $$;

create or replace function public.create_customer_order_atomic(p_customer_id uuid,p_request_id uuid,p_details jsonb)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_phone text;
  v_order public.orders%rowtype;
  v_created boolean;
  v_refresh jsonb;
  v_service_type text := coalesce(nullif(p_details->>'service_type',''),'achilt');
  v_car_type text := nullif(p_details->>'car_type','');
  v_to_address text;
  v_car_mark text;
begin
  if p_request_id is null or p_details is null or jsonb_typeof(p_details)<>'object'
    or jsonb_typeof(p_details->'from_lat') is distinct from 'number'
    or jsonb_typeof(p_details->'from_lng') is distinct from 'number'
    or not ((p_details->>'from_lat')::numeric between -90 and 90)
    or not ((p_details->>'from_lng')::numeric between -180 and 180)
    or jsonb_typeof(p_details->'from_address') is distinct from 'string'
    or length(pg_catalog.btrim(p_details->>'from_address')) not between 1 and 500
    or v_service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
    or (v_service_type='achilt' and v_car_type not in ('butten','chiregch'))
    or (v_service_type<>'achilt' and v_car_type is not null)
  then raise exception 'Invalid booking' using errcode='22023'; end if;

  if v_service_type='achilt' then
    if jsonb_typeof(p_details->'to_address') is distinct from 'string'
       or length(pg_catalog.btrim(p_details->>'to_address')) not between 1 and 500
       or jsonb_typeof(p_details->'car_mark') is distinct from 'string'
       or length(pg_catalog.btrim(p_details->>'car_mark')) not between 1 and 120
    then raise exception 'Invalid booking' using errcode='22023'; end if;
    v_to_address := pg_catalog.btrim(p_details->>'to_address');
    v_car_mark := pg_catalog.btrim(p_details->>'car_mark');
  else
    v_to_address := '';
    v_car_mark := '';
  end if;

  select phone into v_phone from public.users where id=p_customer_id and active is true for share;
  if not found then raise exception 'Customer unavailable' using errcode='42501'; end if;

  insert into public.orders(user_id,user_phone,from_address,to_address,from_lat,from_lng,service_type,car_type,car_mark,status,client_request_id)
  values(p_customer_id,v_phone,pg_catalog.btrim(p_details->>'from_address'),v_to_address,
    (p_details->>'from_lat')::double precision,(p_details->>'from_lng')::double precision,
    v_service_type,v_car_type,v_car_mark,'pending',p_request_id)
  on conflict (user_id,client_request_id) do nothing returning * into v_order;
  v_created:=found;

  if not v_created then
    select * into strict v_order from public.orders where user_id=p_customer_id and client_request_id=p_request_id;
    if v_order.from_address is distinct from pg_catalog.btrim(p_details->>'from_address')
      or v_order.from_lat is distinct from (p_details->>'from_lat')::double precision
      or v_order.from_lng is distinct from (p_details->>'from_lng')::double precision
      or v_order.service_type is distinct from v_service_type
      or v_order.car_type is distinct from v_car_type
      or v_order.to_address is distinct from v_to_address
      or v_order.car_mark is distinct from v_car_mark
    then raise exception 'Booking request changed' using errcode='22023'; end if;
  else
    v_refresh:=public.refresh_order_driver_slots(v_order.id);
  end if;

  return jsonb_build_object('order',jsonb_build_object('id',v_order.id,'status',v_order.status,'service_type',v_order.service_type,'created_at',v_order.created_at),'created',v_created);
end $$;

create or replace function public.refresh_order_driver_slots(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_order public.orders%rowtype;
  v_from geography(point,4326);
  v_inserted integer := 0;
  v_active integer := 0;
  v_expires timestamptz;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.status<>'pending' then
    update public.driver_invites set status='rejected' where order_id=p_order_id and status in ('active','offered');
    return jsonb_build_object('inserted',0,'active_slots',0,'order_status',v_order.status,'expired',true,'bidding_expires_at',v_order.bidding_expires_at);
  end if;
  if v_order.from_lat is null or v_order.from_lng is null then raise exception 'Order location missing'; end if;

  if v_order.driver_invites_initialized_at is null then
    v_expires:=now()+interval '10 minutes';
    update public.orders set driver_invites_initialized_at=now(),bidding_expires_at=v_expires where id=p_order_id;
  else
    v_expires:=v_order.bidding_expires_at;
  end if;

  if v_expires is not null and now()>=v_expires then
    update public.driver_invites set status='expired' where order_id=p_order_id and status in ('active','offered');
    update public.offers set status='declined' where order_id=p_order_id and status='pending';
    return jsonb_build_object('inserted',v_inserted,'active_slots',0,'order_status','pending','expired',true,'bidding_expires_at',v_expires);
  end if;

  if not exists(select 1 from public.driver_invites where order_id=p_order_id) then
    v_from:=st_setsrid(st_makepoint(v_order.from_lng::double precision,v_order.from_lat::double precision),4326)::geography;
    insert into public.driver_invites(order_id,driver_id,rank,status,invited_at,expires_at)
    select p_order_id,d.id,row_number() over(order by st_distance(d.location,v_from),d.id)::integer,'active',now(),v_expires
    from public.drivers d
    where d.active=true
      and d.deleted_at is null
      and d.available=true
      and d.location is not null
      and d.location_updated_at>=now()-interval '2 minutes'
      and d.service_type=v_order.service_type
      and (v_order.service_type<>'achilt' or d.car_type=v_order.car_type)
      and not exists(select 1 from public.payment_codes pc where pc.driver_id=d.id and pc.used is not true)
      and not exists(select 1 from public.orders busy where busy.driver_id=d.id and busy.status='confirmed')
    order by st_distance(d.location,v_from),d.id
    limit 8
    on conflict(order_id,driver_id) do nothing;
    get diagnostics v_inserted=row_count;
  end if;

  update public.driver_invites di set status='offered',offered_at=coalesce(di.offered_at,now())
  where di.order_id=p_order_id and di.status='active'
    and exists(select 1 from public.offers o where o.order_id=di.order_id and o.driver_id=di.driver_id and o.status='pending');

  select count(*) into v_active from public.driver_invites where order_id=p_order_id and status in ('active','offered');
  return jsonb_build_object('inserted',v_inserted,'active_slots',v_active,'order_status','pending','expired',false,'bidding_expires_at',v_expires);
end $$;

create or replace function public.refresh_waiting_orders_for_driver(p_driver_id uuid)
returns jsonb
language plpgsql
set search_path to 'public','extensions'
as $$
declare
  v_driver public.drivers%rowtype;
  v_order record;
  v_result jsonb;
  v_orders jsonb := '[]'::jsonb;
begin
  select * into v_driver from public.drivers where id=p_driver_id;
  if not found or v_driver.active is not true or v_driver.deleted_at is not null
    or v_driver.available is not true or v_driver.location is null
    or v_driver.location_updated_at is null or v_driver.location_updated_at<now()-interval '2 minutes'
    or v_driver.service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
    or (v_driver.service_type='achilt' and coalesce(v_driver.car_type,'') not in ('butten','chiregch'))
    or exists(select 1 from public.orders where driver_id=p_driver_id and status='confirmed')
    or exists(select 1 from public.payment_codes where driver_id=p_driver_id and used is not true)
  then return jsonb_build_object('order_ids',v_orders); end if;

  for v_order in
    select o.id from public.orders o
    where o.status='pending'
      and o.service_type=v_driver.service_type
      and (o.service_type<>'achilt' or o.car_type=v_driver.car_type)
      and (o.bidding_expires_at>now() or (o.driver_invites_initialized_at is null and o.created_at>now()-interval '10 minutes'))
      and not exists(select 1 from public.driver_invites i where i.order_id=o.id)
    order by o.created_at desc
    limit 20
    for update of o skip locked
  loop
    v_result:=public.refresh_order_driver_slots(v_order.id);
    if (v_result->>'inserted')::integer>0 then v_orders:=v_orders||jsonb_build_array(v_order.id); end if;
  end loop;
  return jsonb_build_object('order_ids',v_orders);
end $$;

create or replace function public.retry_customer_order_atomic(p_order_id uuid,p_customer_id uuid,p_customer_phone text)
returns jsonb
language plpgsql
set search_path to 'public','extensions'
as $$
declare
  v_old public.orders%rowtype;
  v_new public.orders%rowtype;
  v_refresh jsonb;
begin
  select * into v_old from public.orders where id=p_order_id for update;
  if not found or p_customer_id is null or p_customer_phone is null
    or (v_old.user_id is not null and v_old.user_id<>p_customer_id)
    or (v_old.user_id is null and v_old.user_phone is distinct from p_customer_phone)
  then raise exception 'Order not found'; end if;

  select * into v_new from public.orders where retry_of_order_id=p_order_id;
  if found then
    return jsonb_build_object('order',jsonb_build_object('id',v_new.id,'status',v_new.status,'service_type',v_new.service_type,'created_at',v_new.created_at),'created',false,'bidding_expires_at',v_new.bidding_expires_at);
  end if;
  if v_old.status<>'pending' then raise exception 'Order already selected'; end if;
  if v_old.bidding_expires_at is null or now()<v_old.bidding_expires_at then raise exception 'Bidding still active'; end if;

  insert into public.orders(user_id,user_phone,from_address,to_address,from_lat,from_lng,service_type,car_type,car_mark,status,retry_of_order_id)
  values(p_customer_id,p_customer_phone,v_old.from_address,v_old.to_address,v_old.from_lat,v_old.from_lng,v_old.service_type,v_old.car_type,v_old.car_mark,'pending',p_order_id)
  returning * into v_new;
  v_refresh:=public.refresh_order_driver_slots(v_new.id);
  return jsonb_build_object('order',jsonb_build_object('id',v_new.id,'status',v_new.status,'service_type',v_new.service_type,'created_at',v_new.created_at),'created',true,'bidding_expires_at',v_refresh->'bidding_expires_at','invited_count',v_refresh->'active_slots');
end $$;

create or replace function public.guard_driver_online()
returns trigger
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
begin
  if new.available is true and (
    not new.active or new.deleted_at is not null
    or new.service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
    or (new.service_type='achilt' and coalesce(new.car_type,'') not in ('butten','chiregch'))
    or exists(select 1 from public.orders where driver_id=new.id and status='confirmed')
    or exists(select 1 from public.payment_codes where driver_id=new.id and used is not true)
  ) then raise exception 'Driver has blocking work or incomplete profile' using errcode='23514'; end if;
  return new;
end $$;

create or replace function public.submit_driver_offer_atomic(p_order_id uuid,p_driver_id uuid,p_price numeric,p_driver_lat double precision default null,p_driver_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_order public.orders%rowtype;
  v_driver public.drivers%rowtype;
  v_invite public.driver_invites%rowtype;
  v_offer_id uuid;
begin
  if p_price is null or p_price<=0 or p_price>10000000 then raise exception 'Invalid offer price'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status<>'pending' then raise exception 'Order unavailable'; end if;
  if v_order.bidding_expires_at is null or now()>=v_order.bidding_expires_at then
    update public.driver_invites set status='expired' where order_id=p_order_id and status in ('active','offered');
    update public.offers set status='declined' where order_id=p_order_id and status='pending';
    raise exception 'Invite expired';
  end if;

  select * into v_driver from public.drivers where id=p_driver_id and active=true and deleted_at is null and available=true for update;
  if not found then raise exception 'Driver unavailable'; end if;
  if v_order.service_type<>v_driver.service_type
     or (v_order.service_type='achilt' and v_order.car_type is distinct from v_driver.car_type) then
    raise exception 'Service type mismatch';
  end if;

  select * into v_invite from public.driver_invites where order_id=p_order_id and driver_id=p_driver_id and status in ('active','offered') for update;
  if not found then raise exception 'Invite unavailable'; end if;
  if now()>=v_invite.expires_at then update public.driver_invites set status='expired' where id=v_invite.id; raise exception 'Invite expired'; end if;
  if exists(select 1 from public.orders busy where busy.driver_id=p_driver_id and busy.status='confirmed' and busy.id<>p_order_id) then raise exception 'Driver already busy'; end if;
  if v_driver.service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
     or (v_driver.service_type='achilt' and coalesce(v_driver.car_type,'') not in ('butten','chiregch'))
     or exists(select 1 from public.payment_codes where driver_id=v_driver.id and used is not true)
  then raise exception 'Driver unavailable'; end if;

  insert into public.offers(order_id,driver_id,driver_name,driver_phone,car_type,price,status,driver_lat,driver_lng)
  values(v_order.id,v_driver.id,v_driver.name,v_driver.phone,v_driver.car_type,round(p_price),'pending',coalesce(p_driver_lat,v_driver.lat::double precision),coalesce(p_driver_lng,v_driver.lng::double precision))
  on conflict(order_id,driver_id) do update set price=excluded.price,driver_name=excluded.driver_name,driver_phone=excluded.driver_phone,car_type=excluded.car_type,driver_lat=excluded.driver_lat,driver_lng=excluded.driver_lng,status='pending'
  returning id into v_offer_id;
  update public.driver_invites set status='offered',offered_at=coalesce(offered_at,now()) where id=v_invite.id;
  return jsonb_build_object('offer_id',v_offer_id,'order_id',v_order.id,'driver_id',v_driver.id,'price',round(p_price));
end $$;

create or replace function public.select_customer_offer_atomic(p_order_id uuid,p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_order public.orders%rowtype;
  v_offer public.offers%rowtype;
  v_driver public.drivers%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status<>'pending' then raise exception 'Order already selected'; end if;
  if v_order.bidding_expires_at is null or now()>=v_order.bidding_expires_at then
    update public.driver_invites set status='expired' where order_id=p_order_id and status in ('active','offered');
    update public.offers set status='declined' where order_id=p_order_id and status='pending';
    raise exception 'Bidding expired';
  end if;

  select * into v_offer from public.offers where id=p_offer_id and order_id=p_order_id and status='pending' for update;
  if not found then raise exception 'Offer not available'; end if;
  if not exists(select 1 from public.driver_invites where order_id=p_order_id and driver_id=v_offer.driver_id and status in ('active','offered')) then raise exception 'Driver is no longer available'; end if;
  select * into v_driver from public.drivers where id=v_offer.driver_id and active=true and deleted_at is null for update;
  if not found or not v_driver.available then raise exception 'Driver is already busy'; end if;
  if exists(select 1 from public.orders where driver_id=v_offer.driver_id and status='confirmed' and id<>p_order_id) then raise exception 'Driver is already busy'; end if;
  if v_order.service_type<>v_driver.service_type
     or (v_order.service_type='achilt' and v_order.car_type is distinct from v_driver.car_type)
     or exists(select 1 from public.payment_codes where driver_id=v_driver.id and used is not true)
  then raise exception 'Driver unavailable'; end if;

  update public.drivers set available=false where id=v_offer.driver_id;
  update public.orders set status='confirmed',driver_id=v_offer.driver_id,driver_name=v_offer.driver_name,driver_phone=v_offer.driver_phone,final_price=v_offer.price where id=p_order_id;
  update public.offers set status=case when id=p_offer_id then 'accepted' else 'declined' end where order_id=p_order_id and status='pending';
  update public.driver_invites set status=case when driver_id=v_offer.driver_id then 'selected' else 'rejected' end where order_id=p_order_id and status in ('active','offered');
  return jsonb_build_object('order_id',p_order_id,'driver_id',v_offer.driver_id,'offer_id',p_offer_id,'price',v_offer.price);
end $$;

revoke all on function public.start_driver_registration_v3(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.start_driver_registration_v3(text,text,text,text,text) to service_role;
revoke all on function public.start_driver_registration_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function public.start_driver_registration_v2(text,text,text,text) to service_role;
revoke all on function public.complete_admin_driver_onboarding_v2(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_admin_driver_onboarding_v2(uuid,text,text,text,text,text) to service_role;
revoke all on function public.create_customer_order_atomic(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_customer_order_atomic(uuid,uuid,jsonb) to service_role;
revoke all on function public.refresh_order_driver_slots(uuid) from public,anon,authenticated;
grant execute on function public.refresh_order_driver_slots(uuid) to service_role;
revoke all on function public.refresh_waiting_orders_for_driver(uuid) from public,anon,authenticated;
grant execute on function public.refresh_waiting_orders_for_driver(uuid) to service_role;
revoke all on function public.retry_customer_order_atomic(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.retry_customer_order_atomic(uuid,uuid,text) to service_role;
revoke all on function public.submit_driver_offer_atomic(uuid,uuid,numeric,double precision,double precision) from public,anon,authenticated;
grant execute on function public.submit_driver_offer_atomic(uuid,uuid,numeric,double precision,double precision) to service_role;
revoke all on function public.select_customer_offer_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.select_customer_offer_atomic(uuid,uuid) to service_role;
