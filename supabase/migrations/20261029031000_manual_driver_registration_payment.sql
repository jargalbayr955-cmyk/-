set lock_timeout = '5s';

-- Driver self-registration is a manual bank-transfer flow.
-- The public form always shows 25,000 MNT and the phone number is used as the bank transfer note.
-- A pending driver is created inactive so an administrator can verify the transfer and activate it.

update public.driver_registration_requests
set amount_due = 25000,
    payment_code = null,
    updated_at = pg_catalog.now()
where status = 'awaiting_payment';

do $$
declare
  r public.driver_registration_requests%rowtype;
  v_driver_id uuid;
  v_driver_active boolean;
begin
  for r in
    select *
    from public.driver_registration_requests
    where status = 'awaiting_payment'
      and driver_id is null
    order by created_at
    for update
  loop
    v_driver_id := null;
    v_driver_active := null;

    select d.id, d.active
      into v_driver_id, v_driver_active
    from public.drivers d
    where d.deleted_at is null
      and pg_catalog.regexp_replace(d.phone, '[^0-9]', '', 'g') = pg_catalog.regexp_replace(r.phone, '[^0-9]', '', 'g')
    limit 1
    for update;

    if v_driver_id is null then
      insert into public.drivers(
        phone, name, pin, pin_hash, car_type, car_number, photo_url,
        available, is_online, active, session_version
      )
      values(
        r.phone,
        coalesce(nullif(pg_catalog.btrim(r.driver_name), ''), 'Шинэ жолооч'),
        null,
        extensions.crypt('000000', extensions.gen_salt('bf', 10)),
        r.car_type,
        null,
        r.photo_data_url,
        false,
        false,
        false,
        pg_catalog.gen_random_uuid()
      )
      returning id into v_driver_id;
    elsif v_driver_active is true then
      -- Never attach a pending payment request to an already-active driver.
      continue;
    end if;

    update public.driver_registration_requests
    set driver_id = v_driver_id,
        amount_due = 25000,
        payment_code = null,
        payment_amount = null,
        payment_confirmed_at = null,
        pin_set_at = null,
        updated_at = pg_catalog.now()
    where id = r.id;
  end loop;
end $$;

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
  v_driver public.drivers%rowtype;
  v_driver_id uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_existing_request boolean := false;
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
  v_existing_request := found;

  if v_existing_request and v_request.status <> 'awaiting_payment' then
    raise exception 'Driver phone already exists' using errcode='23505';
  end if;

  v_driver_id := null;
  if v_existing_request and v_request.driver_id is not null then
    select * into v_driver
    from public.drivers
    where id = v_request.driver_id
      and deleted_at is null
    for update;

    if found then
      if v_driver.active then
        raise exception 'Driver phone already exists' using errcode='23505';
      end if;
      v_driver_id := v_driver.id;
      update public.drivers
      set phone = p_phone,
          name = v_name,
          pin = null,
          pin_hash = extensions.crypt('000000', extensions.gen_salt('bf', 10)),
          car_type = p_car_type,
          car_number = null,
          photo_url = p_photo_data_url,
          price = null,
          lat = null,
          lng = null,
          location = null,
          location_updated_at = null,
          available = false,
          is_online = false,
          active = false,
          session_version = pg_catalog.gen_random_uuid()
      where id = v_driver_id;
    end if;
  end if;

  if v_driver_id is null then
    select d.id into v_driver_id
    from public.drivers d
    where d.deleted_at is null
      and pg_catalog.regexp_replace(d.phone, '[^0-9]', '', 'g') = pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')
    limit 1
    for update;

    if found then
      raise exception 'Driver phone already exists' using errcode='23505';
    end if;

    insert into public.drivers(
      phone, name, pin, pin_hash, car_type, car_number, photo_url,
      available, is_online, active, session_version
    )
    values(
      p_phone,
      v_name,
      null,
      extensions.crypt('000000', extensions.gen_salt('bf', 10)),
      p_car_type,
      null,
      p_photo_data_url,
      false,
      false,
      false,
      pg_catalog.gen_random_uuid()
    )
    returning id into v_driver_id;
  end if;

  if v_existing_request then
    update public.driver_registration_requests
    set car_type = p_car_type,
        driver_name = v_name,
        photo_data_url = p_photo_data_url,
        status = 'awaiting_payment',
        payment_code = null,
        amount_due = 25000,
        payment_amount = null,
        payment_confirmed_at = null,
        driver_id = v_driver_id,
        pin_set_at = null,
        expires_at = pg_catalog.now() + interval '24 hours',
        updated_at = pg_catalog.now()
    where id = v_request.id
    returning * into v_request;
  else
    insert into public.driver_registration_requests(
      phone, car_type, driver_name, photo_data_url, status,
      payment_code, amount_due, driver_id, expires_at
    )
    values(
      p_phone, p_car_type, v_name, p_photo_data_url, 'awaiting_payment',
      null, 25000, v_driver_id, pg_catalog.now() + interval '24 hours'
    )
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', 'awaiting_payment',
    'amount_due', 25000,
    'driver_id', v_driver_id,
    'manual_payment', true,
    'expires_at', v_request.expires_at
  );
end $$;

create or replace function public.mark_manual_driver_registration_paid()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.active is false and new.active is true then
    update public.driver_registration_requests
    set status = 'paid',
        amount_due = 25000,
        payment_amount = 25000,
        payment_confirmed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where driver_id = new.id
      and status = 'awaiting_payment';
  end if;
  return new;
end $$;

drop trigger if exists mark_manual_driver_registration_paid_on_activation on public.drivers;
create trigger mark_manual_driver_registration_paid_on_activation
after update of active on public.drivers
for each row
when (old.active is false and new.active is true)
execute function public.mark_manual_driver_registration_paid();

revoke all on function public.start_driver_registration_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function public.start_driver_registration_v2(text,text,text,text) to service_role;
revoke all on function public.mark_manual_driver_registration_paid() from public,anon,authenticated;
