set lock_timeout = '5s';

alter table public.driver_registration_requests
  add column if not exists driver_name text,
  add column if not exists photo_data_url text,
  add column if not exists payment_code text;

alter table public.driver_registration_requests
  drop constraint if exists driver_registration_requests_driver_name_check,
  add constraint driver_registration_requests_driver_name_check
    check (driver_name is null or (driver_name = btrim(driver_name) and char_length(driver_name) between 1 and 100)),
  drop constraint if exists driver_registration_requests_photo_data_url_check,
  add constraint driver_registration_requests_photo_data_url_check
    check (photo_data_url is null or (octet_length(photo_data_url) <= 300000 and photo_data_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$')),
  drop constraint if exists driver_registration_requests_payment_code_check,
  add constraint driver_registration_requests_payment_code_check
    check (payment_code is null or payment_code ~ '^[0-9]{6}$');

create unique index if not exists driver_registration_requests_payment_code_uidx
  on public.driver_registration_requests(payment_code)
  where payment_code is not null;

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

  if found and v_request.status in ('paid','contacted') then
    return jsonb_build_object(
      'request_id', v_request.id,
      'status', v_request.status,
      'payment_code', v_request.payment_code,
      'payment_amount', v_request.payment_amount,
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
    v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    exit when not exists(
      select 1 from public.driver_registration_requests r where r.payment_code = v_code
    ) and not exists(
      select 1 from public.payment_codes p where p.code = v_code
    );
    v_code := null;
  end loop;
  if v_code is null then
    raise exception 'Unable to allocate registration code' using errcode='P0001';
  end if;

  if found then
    update public.driver_registration_requests
    set car_type = p_car_type,
        driver_name = v_name,
        photo_data_url = p_photo_data_url,
        payment_code = v_code,
        status = 'awaiting_payment',
        payment_amount = null,
        payment_confirmed_at = null,
        driver_id = null,
        expires_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.driver_registration_requests(phone,car_type,driver_name,photo_data_url,payment_code)
    values(p_phone,p_car_type,v_name,p_photo_data_url,v_code)
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'payment_code', v_request.payment_code,
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
declare v_request public.driver_registration_requests%rowtype;
begin
  if p_request_id is null or p_phone is null or p_phone !~ '^\+976[0-9]{8}$' then
    raise exception 'Invalid registration lookup' using errcode='22023';
  end if;
  select * into v_request
  from public.driver_registration_requests
  where id=p_request_id and phone=p_phone;
  if not found then
    raise exception 'Registration request not found' using errcode='P0002';
  end if;
  return jsonb_build_object(
    'request_id',v_request.id,
    'status',v_request.status,
    'car_type',v_request.car_type,
    'payment_code',v_request.payment_code,
    'payment_amount',v_request.payment_amount,
    'payment_confirmed_at',v_request.payment_confirmed_at,
    'expires_at',v_request.expires_at
  );
end $$;

create or replace function public.confirm_driver_registration_payment_by_code(p_code text,p_amount numeric)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.driver_registration_requests%rowtype;
  v_driver_id uuid;
begin
  if p_code is null or p_code !~ '^[0-9]{6}$'
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Invalid registration receipt' using errcode='22023';
  end if;

  select * into v_request
  from public.driver_registration_requests
  where payment_code = p_code
  for update;

  if not found then
    raise exception 'Unknown driver registration reference' using errcode='P0002';
  end if;

  if v_request.status in ('paid','contacted') then
    if v_request.payment_amount is distinct from p_amount then
      raise exception 'Registration payment amount mismatch' using errcode='P0001';
    end if;
    return jsonb_build_object('success',true,'already_confirmed',true,'request_id',v_request.id,'driver_id',v_request.driver_id);
  end if;

  if v_request.status <> 'awaiting_payment' or v_request.expires_at < now() then
    raise exception 'Driver registration request expired' using errcode='P0002';
  end if;

  select id into v_driver_id
  from public.drivers
  where regexp_replace(phone,'[^0-9]','','g') = regexp_replace(v_request.phone,'[^0-9]','','g')
    and deleted_at is null
  order by created_at desc nulls last
  limit 1
  for update;

  if v_driver_id is null then
    insert into public.drivers(phone,name,pin,pin_hash,car_type,photo_url,available,active)
    values(
      v_request.phone,
      coalesce(nullif(btrim(v_request.driver_name),''),'Шинэ жолооч'),
      null,
      extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf',10)),
      v_request.car_type,
      v_request.photo_data_url,
      false,
      false
    )
    returning id into v_driver_id;
  end if;

  update public.driver_registration_requests
  set status='paid',
      payment_amount=p_amount,
      payment_confirmed_at=now(),
      driver_id=v_driver_id,
      updated_at=now()
  where id=v_request.id;

  return jsonb_build_object('success',true,'already_confirmed',false,'request_id',v_request.id,'driver_id',v_driver_id);
end $$;

revoke all on function public.start_driver_registration_v2(text,text,text,text) from public,anon,authenticated;
revoke all on function public.confirm_driver_registration_payment_by_code(text,numeric) from public,anon,authenticated;
grant execute on function public.start_driver_registration_v2(text,text,text,text) to service_role;
grant execute on function public.confirm_driver_registration_payment_by_code(text,numeric) to service_role;
