create unique index if not exists drivers_active_normalized_phone_unique
  on public.drivers ((pg_catalog.regexp_replace(phone, '[^0-9]', '', 'g')))
  where deleted_at is null;

create or replace function public.admin_create_driver_secure(
  p_phone text,
  p_name text,
  p_pin text,
  p_car_type text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_digits text;
begin
  if p_phone is null
     or p_phone !~ '^\+976[0-9]{8}$'
     or p_pin is distinct from '000000' then
    raise exception using errcode = '22023', message = 'Invalid driver';
  end if;

  v_digits := pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g');

  select d.id into v_id
  from public.drivers d
  where d.deleted_at is null
    and pg_catalog.regexp_replace(d.phone, '[^0-9]', '', 'g') = v_digits
  limit 1;

  if v_id is not null then
    raise exception using errcode = '23505', message = 'Driver phone already exists';
  end if;

  select d.id into v_id
  from public.drivers d
  where d.deleted_at is not null
    and pg_catalog.regexp_replace(d.phone, '[^0-9]', '', 'g') = v_digits
  order by d.created_at desc nulls last, d.id desc
  limit 1
  for update;

  if v_id is not null then
    update public.drivers
    set phone = p_phone,
        name = coalesce(nullif(pg_catalog.btrim(p_name), ''), 'Шинэ жолооч'),
        pin = null,
        pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
        car_type = p_car_type,
        car_number = null,
        photo_url = null,
        price = null,
        lat = null,
        lng = null,
        location = null,
        location_updated_at = null,
        available = false,
        is_online = false,
        active = true,
        deleted_at = null,
        session_version = pg_catalog.gen_random_uuid()
    where id = v_id;
  else
    insert into public.drivers(
      phone, name, pin, pin_hash, car_type, car_number, available, is_online,
      active, session_version
    )
    values(
      p_phone,
      coalesce(nullif(pg_catalog.btrim(p_name), ''), 'Шинэ жолооч'),
      null,
      extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
      p_car_type,
      null,
      false,
      false,
      true,
      pg_catalog.gen_random_uuid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_create_driver_secure(text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_driver_secure(text, text, text, text) to service_role;
