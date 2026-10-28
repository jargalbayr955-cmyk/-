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

  if v_existing then
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
