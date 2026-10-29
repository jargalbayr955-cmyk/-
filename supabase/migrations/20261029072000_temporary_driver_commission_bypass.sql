set lock_timeout = '5s';

-- Temporary launch mode: drivers finish work without paying a service commission.
-- Keep the existing commission tables/functions intact so charging can be re-enabled later.
insert into public.settings(key, value)
values ('driver_commission_enabled', 'false')
on conflict (key) do update set value = excluded.value;

create or replace function public.complete_order_without_commission(
  p_order_id uuid,
  p_driver_id uuid,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_driver public.drivers%rowtype;
  v_available boolean;
  v_already_completed boolean;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
     or v_order.driver_id is distinct from p_driver_id
     or v_order.status not in ('confirmed', 'completed') then
    raise exception 'Order unavailable';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
  for update;

  if not found or v_driver.active is not true or v_driver.deleted_at is not null then
    raise exception 'Driver unavailable';
  end if;

  v_already_completed := v_order.status = 'completed';

  if not v_already_completed then
    if v_order.final_price is null or v_order.final_price <= 0 then
      raise exception 'Order price unavailable';
    end if;

    update public.orders
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        duration_minutes = coalesce(duration_minutes, greatest(0, coalesce(p_duration_minutes, 0)))
    where id = p_order_id;
  end if;

  v_available :=
    v_driver.active is true
    and v_driver.deleted_at is null
    and coalesce(btrim(v_driver.name), '') <> ''
    and v_driver.name <> 'Шинэ жолооч'
    and coalesce(btrim(v_driver.car_number), '') <> ''
    and (
      (v_driver.service_type = 'achilt' and v_driver.car_type in ('butten', 'chiregch'))
      or v_driver.service_type in ('crane', 'excavator', 'car_start', 'bobcat', 'loader')
    )
    and not exists (
      select 1 from public.orders o
      where o.driver_id = p_driver_id and o.status = 'confirmed'
    );

  update public.drivers
  set available = v_available
  where id = p_driver_id;

  return jsonb_build_object(
    'success', true,
    'already_completed', v_already_completed,
    'available', v_available,
    'fare_amount', v_order.final_price,
    'payment_required', false
  );
end;
$$;

revoke all on function public.complete_order_without_commission(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.complete_order_without_commission(uuid, uuid, integer)
  to service_role;

-- Existing unpaid commissions must not strand drivers while charging is disabled.
-- Preserve the rows for audit/history, but mark them as waived rather than deleting them.
with waived as (
  update public.payment_codes
  set used = true,
      approved_at = coalesce(approved_at, now()),
      approved_via = 'temporary_waiver'
  where used is not true
  returning driver_id
)
update public.drivers d
set available = (
  d.active is true
  and d.deleted_at is null
  and coalesce(btrim(d.name), '') <> ''
  and d.name <> 'Шинэ жолооч'
  and coalesce(btrim(d.car_number), '') <> ''
  and (
    (d.service_type = 'achilt' and d.car_type in ('butten', 'chiregch'))
    or d.service_type in ('crane', 'excavator', 'car_start', 'bobcat', 'loader')
  )
  and not exists (
    select 1 from public.orders o
    where o.driver_id = d.id and o.status = 'confirmed'
  )
)
where d.id in (select distinct driver_id from waived);
