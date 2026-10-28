set lock_timeout = '5s';

create or replace function public.cleanup_stale_dispatch_orders()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invites integer := 0;
  v_offers integer := 0;
  v_pending integer := 0;
  v_confirmed integer := 0;
begin
  update public.driver_invites di
  set status = 'expired'
  where di.status in ('active', 'offered')
    and exists (
      select 1
      from public.orders o
      where o.id = di.order_id
        and (
          (
            o.status = 'pending'
            and (
              (o.bidding_expires_at is not null and o.bidding_expires_at < pg_catalog.now() - interval '1 hour')
              or (o.bidding_expires_at is null and o.created_at < pg_catalog.now() - interval '24 hours')
            )
          )
          or (
            o.status = 'confirmed'
            and o.driver_id is null
            and o.created_at < pg_catalog.now() - interval '1 hour'
          )
        )
    );
  get diagnostics v_invites = row_count;

  update public.offers off
  set status = 'declined'
  where off.status = 'pending'
    and exists (
      select 1
      from public.orders o
      where o.id = off.order_id
        and (
          (
            o.status = 'pending'
            and (
              (o.bidding_expires_at is not null and o.bidding_expires_at < pg_catalog.now() - interval '1 hour')
              or (o.bidding_expires_at is null and o.created_at < pg_catalog.now() - interval '24 hours')
            )
          )
          or (
            o.status = 'confirmed'
            and o.driver_id is null
            and o.created_at < pg_catalog.now() - interval '1 hour'
          )
        )
    );
  get diagnostics v_offers = row_count;

  update public.orders
  set status = 'cancelled'
  where status = 'pending'
    and (
      (bidding_expires_at is not null and bidding_expires_at < pg_catalog.now() - interval '1 hour')
      or (bidding_expires_at is null and created_at < pg_catalog.now() - interval '24 hours')
    );
  get diagnostics v_pending = row_count;

  update public.orders
  set status = 'cancelled'
  where status = 'confirmed'
    and driver_id is null
    and created_at < pg_catalog.now() - interval '1 hour';
  get diagnostics v_confirmed = row_count;

  return jsonb_build_object(
    'expired_invites', v_invites,
    'declined_offers', v_offers,
    'cancelled_pending_orders', v_pending,
    'cancelled_unlinked_confirmed_orders', v_confirmed
  );
end;
$$;

revoke all on function public.cleanup_stale_dispatch_orders() from public, anon, authenticated;
grant execute on function public.cleanup_stale_dispatch_orders() to service_role;

create or replace function public.admin_pending_driver_payments()
returns table(
  id uuid,
  driver_id uuid,
  driver_name text,
  driver_phone text,
  from_address text,
  to_address text,
  code text,
  amount numeric,
  completed_at timestamptz,
  total_pending bigint
)
language sql
stable
set search_path = ''
as $$
  select o.id,
    pc.driver_id,
    d.name::text,
    d.phone::text,
    o.from_address::text,
    o.to_address::text,
    pc.code::text,
    pc.amount::numeric,
    o.completed_at,
    count(*) over ()
  from public.payment_codes pc
  join public.orders o on o.id = pc.order_id
  join public.drivers d on d.id = pc.driver_id
    and d.active is true
    and d.deleted_at is null
  where pc.used is not true
    and o.status = 'completed'
  order by o.completed_at asc nulls last, pc.id
  limit 200;
$$;

create or replace function public.admin_search_driver_payments(
  p_search text default ''::text,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with term as (
    select regexp_replace(upper(left(coalesce(p_search, ''), 40)), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g') as value
  ), matches as (
    select o.id,
      pc.driver_id,
      d.name::text as driver_name,
      d.phone::text as driver_phone,
      d.car_number,
      o.from_address,
      o.to_address,
      pc.code,
      pc.amount,
      pc.fare_amount,
      o.completed_at
    from public.payment_codes pc
    join public.orders o on o.id = pc.order_id
    join public.drivers d on d.id = pc.driver_id
      and d.active is true
      and d.deleted_at is null
    cross join term t
    where pc.used is not true
      and o.status = 'completed'
      and (
        btrim(coalesce(p_search, '')) = ''
        or (
          t.value <> ''
          and (
            position(t.value in regexp_replace(upper(coalesce(d.car_number, '')), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g')) > 0
            or position(t.value in regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g')) > 0
          )
        )
      )
  ), page as (
    select *
    from matches
    order by completed_at asc nulls last, id
    limit 50 offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'payments', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.completed_at asc nulls last, p.id) from page p),
      '[]'::jsonb
    ),
    'total', (select count(*) from matches)
  );
$$;

revoke all on function public.admin_pending_driver_payments() from public, anon, authenticated;
revoke all on function public.admin_search_driver_payments(text, integer) from public, anon, authenticated;
grant execute on function public.admin_pending_driver_payments() to service_role;
grant execute on function public.admin_search_driver_payments(text, integer) to service_role;

select public.cleanup_stale_dispatch_orders();
