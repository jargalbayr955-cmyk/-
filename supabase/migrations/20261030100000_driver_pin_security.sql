create or replace function public.start_driver_registration_v6(
  p_phone text,
  p_service_type text,
  p_car_type text,
  p_name text,
  p_pin text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_driver_id uuid;
  v_session_version uuid := pg_catalog.gen_random_uuid();
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_car_type text := case when p_service_type='achilt' then p_car_type else null end;
begin
  if p_phone is null or p_phone !~ '^\\+976[0-9]{8}$'
     or p_service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
     or (p_service_type='achilt' and p_car_type not in ('butten','chiregch'))
     or (p_service_type<>'achilt' and nullif(coalesce(p_car_type,''),'') is not null)
     or char_length(v_name) < 1 or char_length(v_name) > 100
     or p_pin is null or p_pin !~ '^[0-9]{6}$' or p_pin='000000'
  then
    raise exception 'Invalid driver registration' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.drivers d
    where d.deleted_at is null
      and pg_catalog.regexp_replace(d.phone,'[^0-9]','','g') = pg_catalog.regexp_replace(p_phone,'[^0-9]','','g')
  ) then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  insert into public.drivers(
    phone,name,pin,pin_hash,service_type,car_type,car_number,photo_url,
    available,is_online,active,session_version
  ) values (
    p_phone,v_name,null,extensions.crypt(p_pin,extensions.gen_salt('bf',10)),
    p_service_type,v_car_type,null,null,
    true,false,true,v_session_version
  ) returning id into v_driver_id;

  return jsonb_build_object(
    'driver_id',v_driver_id,
    'service_type',p_service_type,
    'car_type',v_car_type,
    'active',true,
    'available',true,
    'approval_required',false,
    'payment_required',false
  );
end
$function$;

revoke all on function public.start_driver_registration_v6(text,text,text,text,text) from public;
revoke all on function public.start_driver_registration_v6(text,text,text,text,text) from anon;
revoke all on function public.start_driver_registration_v6(text,text,text,text,text) from authenticated;
grant execute on function public.start_driver_registration_v6(text,text,text,text,text) to service_role;

create or replace function public.reset_driver_pin_verified(
  p_phone text,
  p_pin text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_driver public.drivers%rowtype;
  v_session_version uuid := pg_catalog.gen_random_uuid();
begin
  if p_phone is null or p_phone !~ '^\\+976[0-9]{8}$'
     or p_pin is null or p_pin !~ '^[0-9]{6}$' or p_pin='000000'
  then
    raise exception 'Invalid PIN reset' using errcode='22023';
  end if;

  select * into v_driver
  from public.drivers d
  where d.deleted_at is null
    and d.active=true
    and pg_catalog.regexp_replace(d.phone,'[^0-9]','','g') = pg_catalog.regexp_replace(p_phone,'[^0-9]','','g')
  limit 1
  for update;

  if not found then
    raise exception 'Driver not found' using errcode='P0002';
  end if;

  update public.drivers
  set pin=null,
      pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf',10)),
      session_version=v_session_version
  where id=v_driver.id;

  return jsonb_build_object('driver_id',v_driver.id,'session_version',v_session_version);
end
$function$;

revoke all on function public.reset_driver_pin_verified(text,text) from public;
revoke all on function public.reset_driver_pin_verified(text,text) from anon;
revoke all on function public.reset_driver_pin_verified(text,text) from authenticated;
grant execute on function public.reset_driver_pin_verified(text,text) to service_role;
