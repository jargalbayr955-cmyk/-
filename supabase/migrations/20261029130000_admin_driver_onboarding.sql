create or replace function public.complete_admin_driver_onboarding(
  p_driver_id uuid,
  p_name text,
  p_car_number text,
  p_pin text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_car_number text := btrim(coalesce(p_car_number, ''));
begin
  if p_driver_id is null
     or char_length(v_name) < 1 or char_length(v_name) > 100
     or char_length(v_car_number) < 1 or char_length(v_car_number) > 30
     or p_pin is null or p_pin !~ '^[0-9]{6}$'
     or p_pin = '000000' then
    raise exception 'Invalid driver onboarding' using errcode='22023';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id and active = true and deleted_at is null
  for update;
  if not found then
    raise exception 'Driver not found' using errcode='P0002';
  end if;

  if coalesce(btrim(v_driver.name), '') <> ''
     and btrim(v_driver.name) <> 'Шинэ жолооч'
     and coalesce(btrim(v_driver.car_number), '') <> '' then
    raise exception 'Driver onboarding already completed' using errcode='P0001';
  end if;

  update public.drivers
  set name = v_name,
      car_number = v_car_number,
      car_type = case when car_type in ('butten','chiregch') then car_type else 'butten' end,
      pin = null,
      pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
      available = false,
      session_version = gen_random_uuid()
  where id = p_driver_id
  returning * into v_driver;

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_driver.id,
      'name', v_driver.name,
      'phone', v_driver.phone,
      'car_type', v_driver.car_type,
      'car_number', v_driver.car_number,
      'photo_url', v_driver.photo_url,
      'price', v_driver.price,
      'available', v_driver.available,
      'active', v_driver.active,
      'lat', v_driver.lat,
      'lng', v_driver.lng,
      'location_updated_at', v_driver.location_updated_at
    ),
    'session_version', v_driver.session_version
  );
end $$;

revoke all on function public.complete_admin_driver_onboarding(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_admin_driver_onboarding(uuid,text,text,text) to service_role;
