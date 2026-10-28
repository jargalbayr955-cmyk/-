set lock_timeout = '5s';

alter table public.driver_registration_requests
  add column if not exists amount_due numeric,
  add column if not exists pin_set_at timestamptz;

update public.driver_registration_requests
set amount_due = case
  when status in ('paid','contacted') and payment_amount is not null then payment_amount
  when now() < timestamptz '2026-11-11 09:55:00+00' then 25000
  else 100000
end
where amount_due is null;

alter table public.driver_registration_requests
  drop constraint if exists driver_registration_requests_amount_due_check,
  add constraint driver_registration_requests_amount_due_check
    check (amount_due is null or (amount_due > 0 and amount_due = trunc(amount_due)));

create or replace function public.start_driver_registration_v2(
  p_phone text,
  p_car_type text,
  p_name text,
  p_photo_data_url text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_attempt integer;
  v_existing boolean := false;
  v_regular_fee numeric := 100000;
  v_promo_ends_at timestamptz := timestamptz '2026-11-11 09:55:00+00';
  v_amount_due numeric := case when now() < timestamptz '2026-11-11 09:55:00+00' then 25000 else 100000 end;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$'
     or p_car_type not in ('butten','chiregch')
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
  where phone = p_phone
  for update;
  v_existing := found;

  if v_existing and v_request.status in ('paid','contacted') then
    return jsonb_build_object(
      'request_id', v_request.id,
      'status', v_request.status,
      'payment_code', v_request.payment_code,
      'payment_amount', v_request.payment_amount,
      'amount_due', coalesce(v_request.amount_due, v_request.payment_amount),
      'regular_fee', v_regular_fee,
      'promo_percent', 25,
      'promo_ends_at', v_promo_ends_at,
      'promo_active', coalesce(v_request.amount_due, v_request.payment_amount) = 25000,
      'pin_set', v_request.pin_set_at is not null,
      'expires_at', v_request.expires_at
    );
  end if;

  if exists(
    select 1 from public.drivers d
    where regexp_replace(d.phone,'[^0-9]','','g') = regexp_replace(p_phone,'[^0-9]','','g')
      and d.deleted_at is null
  ) then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  for v_attempt in 1..50 loop
    v_code := lpad(floor(random() * 100000)::integer::text, 6, '0');
    exit when not exists(select 1 from public.driver_registration_requests r where r.payment_code = v_code)
      and not exists(select 1 from public.payment_codes p where p.code = v_code);
    v_code := null;
  end loop;
  if v_code is null then raise exception 'Unable to allocate registration code' using errcode='P0001'; end if;

  if v_existing then
    update public.driver_registration_requests
    set car_type = p_car_type,
        driver_name = v_name,
        photo_data_url = p_photo_data_url,
        payment_code = v_code,
        status = 'awaiting_payment',
        amount_due = v_amount_due,
        payment_amount = null,
        payment_confirmed_at = null,
        driver_id = null,
        pin_set_at = null,
        expires_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.driver_registration_requests(phone,car_type,driver_name,photo_data_url,payment_code,amount_due)
    values(p_phone,p_car_type,v_name,p_photo_data_url,v_code,v_amount_due)
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'payment_code', v_request.payment_code,
    'amount_due', v_request.amount_due,
    'regular_fee', v_regular_fee,
    'promo_percent', 25,
    'promo_ends_at', v_promo_ends_at,
    'promo_active', v_request.amount_due = 25000,
    'pin_set', false,
    'expires_at', v_request.expires_at
  );
end $$;

create or replace function public.get_driver_registration_status(p_request_id uuid,p_phone text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_regular_fee numeric := 100000;
  v_promo_ends_at timestamptz := timestamptz '2026-11-11 09:55:00+00';
begin
  if p_request_id is null or p_phone is null or p_phone !~ '^\+976[0-9]{8}$' then
    raise exception 'Invalid registration lookup' using errcode='22023';
  end if;
  select * into v_request from public.driver_registration_requests where id=p_request_id and phone=p_phone;
  if not found then raise exception 'Registration request not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'request_id',v_request.id,
    'status',v_request.status,
    'car_type',v_request.car_type,
    'payment_code',v_request.payment_code,
    'amount_due',v_request.amount_due,
    'regular_fee',v_regular_fee,
    'promo_percent',25,
    'promo_ends_at',v_promo_ends_at,
    'promo_active',v_request.amount_due=25000,
    'payment_amount',v_request.payment_amount,
    'payment_confirmed_at',v_request.payment_confirmed_at,
    'pin_set',v_request.pin_set_at is not null,
    'expires_at',v_request.expires_at
  );
end $$;

create or replace function public.confirm_driver_registration_payment_by_code(p_code text, p_amount numeric)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_driver_id uuid;
begin
  if p_code is null or p_code !~ '^0[0-9]{5}$'
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Invalid registration receipt' using errcode='22023';
  end if;

  select * into v_request
  from public.driver_registration_requests
  where payment_code = p_code
  for update;
  if not found then raise exception 'Unknown driver registration reference' using errcode='P0002'; end if;

  if v_request.status in ('paid','contacted') then
    if v_request.payment_amount is distinct from p_amount or v_request.amount_due is distinct from p_amount then
      raise exception 'Registration payment amount mismatch' using errcode='P0001';
    end if;
    return jsonb_build_object('success',true,'already_confirmed',true,'request_id',v_request.id,'driver_id',v_request.driver_id,'amount_due',v_request.amount_due,'pin_required',v_request.pin_set_at is null);
  end if;

  if v_request.status <> 'awaiting_payment' or v_request.expires_at < now() then
    raise exception 'Driver registration request expired' using errcode='P0002';
  end if;
  if v_request.amount_due is null or p_amount is distinct from v_request.amount_due then
    raise exception 'Registration payment amount mismatch' using errcode='P0001';
  end if;

  if exists(
    select 1 from public.drivers d
    where regexp_replace(d.phone,'[^0-9]','','g') = regexp_replace(v_request.phone,'[^0-9]','','g')
      and d.deleted_at is null
  ) then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  insert into public.drivers(phone,name,pin,pin_hash,car_type,photo_url,available,active,session_version)
  values(
    v_request.phone,
    coalesce(nullif(btrim(v_request.driver_name),''),'Шинэ жолооч'),
    null,
    extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf',10)),
    v_request.car_type,
    v_request.photo_data_url,
    false,
    true,
    gen_random_uuid()
  )
  returning id into v_driver_id;

  update public.driver_registration_requests
  set status='paid',
      payment_amount=p_amount,
      payment_confirmed_at=now(),
      driver_id=v_driver_id,
      updated_at=now()
  where id=v_request.id;

  return jsonb_build_object('success',true,'already_confirmed',false,'request_id',v_request.id,'driver_id',v_driver_id,'amount_due',v_request.amount_due,'pin_required',true);
end $$;

create or replace function public.confirm_driver_registration_payment(p_phone text,p_amount numeric)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_driver_id uuid;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$'
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Invalid registration receipt' using errcode='22023';
  end if;

  select * into v_request
  from public.driver_registration_requests
  where phone = p_phone
  for update;
  if not found then raise exception 'Unknown driver registration reference' using errcode='P0002'; end if;

  if v_request.status in ('paid','contacted') then
    if v_request.payment_amount is distinct from p_amount or v_request.amount_due is distinct from p_amount then
      raise exception 'Registration payment amount mismatch' using errcode='P0001';
    end if;
    return jsonb_build_object('success',true,'already_confirmed',true,'request_id',v_request.id,'driver_id',v_request.driver_id,'amount_due',v_request.amount_due,'pin_required',v_request.pin_set_at is null);
  end if;

  if v_request.status <> 'awaiting_payment' or v_request.expires_at < now() then
    raise exception 'Driver registration request expired' using errcode='P0002';
  end if;
  if v_request.amount_due is null or p_amount is distinct from v_request.amount_due then
    raise exception 'Registration payment amount mismatch' using errcode='P0001';
  end if;

  if exists(
    select 1 from public.drivers d
    where regexp_replace(d.phone,'[^0-9]','','g') = regexp_replace(v_request.phone,'[^0-9]','','g')
      and d.deleted_at is null
  ) then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  insert into public.drivers(phone,name,pin,pin_hash,car_type,photo_url,available,active,session_version)
  values(
    v_request.phone,
    coalesce(nullif(btrim(v_request.driver_name),''),'Шинэ жолооч'),
    null,
    extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf',10)),
    v_request.car_type,
    v_request.photo_data_url,
    false,
    true,
    gen_random_uuid()
  )
  returning id into v_driver_id;

  update public.driver_registration_requests
  set status='paid',
      payment_amount=p_amount,
      payment_confirmed_at=now(),
      driver_id=v_driver_id,
      updated_at=now()
  where id=v_request.id;

  return jsonb_build_object('success',true,'already_confirmed',false,'request_id',v_request.id,'driver_id',v_driver_id,'amount_due',v_request.amount_due,'pin_required',true);
end $$;

create or replace function public.complete_driver_registration_pin(p_request_id uuid,p_phone text,p_pin text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_changed integer;
begin
  if p_request_id is null or p_phone is null or p_phone !~ '^\+976[0-9]{8}$' or p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Invalid driver PIN setup' using errcode='22023';
  end if;

  select * into v_request
  from public.driver_registration_requests
  where id=p_request_id and phone=p_phone
  for update;
  if not found or v_request.status not in ('paid','contacted') or v_request.driver_id is null then
    raise exception 'Paid driver registration not found' using errcode='P0002';
  end if;

  if v_request.pin_set_at is not null then
    return jsonb_build_object('success',true,'already_set',true,'driver_id',v_request.driver_id,'login_phone',v_request.phone);
  end if;

  update public.drivers
  set pin=null,
      pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),
      active=true,
      available=false,
      session_version=gen_random_uuid()
  where id=v_request.driver_id and deleted_at is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'Driver registration missing' using errcode='P0002'; end if;

  update public.driver_registration_requests
  set status='contacted', pin_set_at=now(), updated_at=now()
  where id=v_request.id;

  return jsonb_build_object('success',true,'already_set',false,'driver_id',v_request.driver_id,'login_phone',v_request.phone);
end $$;

revoke all on function public.start_driver_registration_v2(text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_driver_registration_status(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_driver_registration_payment_by_code(text,numeric) from public,anon,authenticated;
revoke all on function public.confirm_driver_registration_payment(text,numeric) from public,anon,authenticated;
revoke all on function public.complete_driver_registration_pin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.start_driver_registration_v2(text,text,text,text) to service_role;
grant execute on function public.get_driver_registration_status(uuid,text) to service_role;
grant execute on function public.confirm_driver_registration_payment_by_code(text,numeric) to service_role;
grant execute on function public.confirm_driver_registration_payment(text,numeric) to service_role;
grant execute on function public.complete_driver_registration_pin(uuid,text,text) to service_role;
