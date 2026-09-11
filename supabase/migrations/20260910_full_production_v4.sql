-- Achilt Production V4 (RLS-safe)
-- Business rules:
-- 1) A pending order exposes up to 5 nearest available drivers.
-- 2) All 5 can submit a price at the same time.
-- 3) After 60 seconds, drivers that did not offer are rotated out and replaced by the next nearest drivers.
-- 4) Drivers that already offered remain in the 5 slots until the customer chooses.
-- 5) As soon as the customer chooses one offer, the order is locked and no more offers are accepted.
-- Safe to rerun. Existing orders/drivers are not deleted.

create extension if not exists pgcrypto;

-- Clean old duplicate offers before enforcing one offer per driver/order.
with ranked as (
  select ctid,
         row_number() over (
           partition by order_id, driver_id
           order by case when status = 'accepted' then 0 else 1 end, ctid desc
         ) as rn
  from public.offers
)
delete from public.offers o
using ranked r
where o.ctid = r.ctid and r.rn > 1;

-- Clean duplicate payment codes before enforcing uniqueness.
with ranked as (
  select ctid,
         row_number() over (
           partition by code
           order by case when used = true then 0 else 1 end, ctid desc
         ) as rn
  from public.payment_codes
  where code is not null
)
delete from public.payment_codes p
using ranked r
where p.ctid = r.ctid and r.rn > 1;

-- Core performance indexes.
create index if not exists orders_status_car_type_created_idx
  on public.orders (status, car_type, created_at desc);
create index if not exists orders_driver_status_idx
  on public.orders (driver_id, status);
create index if not exists offers_order_status_price_idx
  on public.offers (order_id, status, price);
create index if not exists drivers_car_available_idx
  on public.drivers (car_type, available);
create index if not exists payment_codes_driver_used_idx
  on public.payment_codes (driver_id, used);
create unique index if not exists offers_order_driver_unique_idx
  on public.offers (order_id, driver_id);
create unique index if not exists payment_codes_code_unique_idx
  on public.payment_codes (code);

-- Which five drivers currently have the right to quote for an order.
create table if not exists public.driver_invites (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  rank integer not null,
  status text not null default 'active' check (status in ('active','offered','expired','selected','rejected')),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  offered_at timestamptz,
  notified_at timestamptz,
  unique (order_id, driver_id)
);

create index if not exists driver_invites_order_status_idx
  on public.driver_invites(order_id, status, rank);
create index if not exists driver_invites_driver_status_idx
  on public.driver_invites(driver_id, status, invited_at desc);
create index if not exists driver_invites_expiry_idx
  on public.driver_invites(status, expires_at)
  where status = 'active';

-- Refresh the five active slots for one order.
-- Offered drivers stay. Non-offering active drivers expire after 60s and are replaced.
create or replace function public.refresh_order_driver_slots(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_current integer := 0;
  v_needed integer := 0;
  v_inserted integer := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'pending' then
    update public.driver_invites
      set status = 'rejected'
    where order_id = p_order_id and status in ('active','offered');
    return jsonb_build_object('inserted', 0, 'active_slots', 0, 'order_status', v_order.status);
  end if;

  -- Any driver with a real pending offer is retained.
  update public.driver_invites di
  set status = 'offered', offered_at = coalesce(di.offered_at, now())
  where di.order_id = p_order_id
    and di.status = 'active'
    and exists (
      select 1 from public.offers o
      where o.order_id = di.order_id
        and o.driver_id = di.driver_id
        and o.status = 'pending'
    );

  -- Rotate only drivers that did not submit a price before expiry.
  update public.driver_invites di
  set status = 'expired'
  where di.order_id = p_order_id
    and di.status = 'active'
    and di.expires_at <= now()
    and not exists (
      select 1 from public.offers o
      where o.order_id = di.order_id
        and o.driver_id = di.driver_id
        and o.status = 'pending'
    );

  select count(*) into v_current
  from public.driver_invites
  where order_id = p_order_id and status in ('active','offered');

  v_needed := greatest(0, 5 - v_current);

  if v_needed > 0 then
    with base as (
      select coalesce(max(rank), 0) as base_rank
      from public.driver_invites
      where order_id = p_order_id
    ), candidates as (
      select d.id as driver_id,
             row_number() over (
               order by (
                 6371.0 * acos(
                   least(1.0, greatest(-1.0,
                     cos(radians(v_order.from_lat::double precision)) *
                     cos(radians(d.lat::double precision)) *
                     cos(radians(d.lng::double precision) - radians(v_order.from_lng::double precision)) +
                     sin(radians(v_order.from_lat::double precision)) *
                     sin(radians(d.lat::double precision))
                   ))
                 )
               ) asc,
               d.id
             ) as rn
      from public.drivers d
      where d.available = true
        and d.lat is not null and d.lng is not null
        and (v_order.car_type is null or d.car_type is null or d.car_type = v_order.car_type)
        and not exists (
          select 1 from public.driver_invites old
          where old.order_id = p_order_id and old.driver_id = d.id
        )
      limit v_needed
    )
    insert into public.driver_invites(order_id, driver_id, rank, status, invited_at, expires_at)
    select p_order_id,
           c.driver_id,
           b.base_rank + c.rn::integer,
           'active',
           now(),
           now() + interval '60 seconds'
    from candidates c cross join base b
    on conflict (order_id, driver_id) do nothing;

    get diagnostics v_inserted = row_count;
  end if;

  select count(*) into v_current
  from public.driver_invites
  where order_id = p_order_id and status in ('active','offered');

  return jsonb_build_object('inserted', v_inserted, 'active_slots', v_current, 'order_status', 'pending');
end;
$$;

-- Customer selects exactly one offer. This locks the order and stops all other offers.
create or replace function public.select_customer_offer_atomic(p_order_id uuid, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_offer public.offers%rowtype;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then raise exception 'Order already selected'; end if;

  select * into v_offer
  from public.offers
  where id = p_offer_id
    and order_id = p_order_id
    and status = 'pending'
  for update;

  if not found then raise exception 'Offer not available'; end if;

  if not exists (
    select 1 from public.driver_invites
    where order_id = p_order_id
      and driver_id = v_offer.driver_id
      and status in ('active','offered')
  ) then
    raise exception 'Driver is no longer in active slots';
  end if;

  update public.orders
  set status = 'confirmed',
      driver_id = v_offer.driver_id,
      driver_name = v_offer.driver_name,
      driver_phone = v_offer.driver_phone,
      final_price = coalesce(final_price, v_offer.price)
  where id = p_order_id;

  update public.offers
  set status = case when id = p_offer_id then 'accepted' else 'declined' end
  where order_id = p_order_id and status = 'pending';

  update public.driver_invites
  set status = case when driver_id = v_offer.driver_id then 'selected' else 'rejected' end
  where order_id = p_order_id and status in ('active','offered');

  -- Reserve selected driver so they cannot enter another customer's nearest-five pool.
  update public.drivers set available = false where id = v_offer.driver_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'driver_id', v_offer.driver_id,
    'offer_id', p_offer_id,
    'price', v_offer.price
  );
end;
$$;

-- Backward-compatible function name used by the V2 API.
create or replace function public.accept_offer_atomic(p_order_id uuid, p_offer_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.select_customer_offer_atomic(p_order_id, p_offer_id);
$$;

-- Complete an order and issue/reuse a unique payment reference in one transaction.
create or replace function public.complete_order_and_issue_payment(
  p_order_id uuid,
  p_driver_id uuid,
  p_amount numeric,
  p_duration_minutes integer
)
returns table(code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_code text;
  i integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.driver_id is distinct from p_driver_id then raise exception 'Driver mismatch'; end if;
  if v_order.status not in ('confirmed','completed') then raise exception 'Order cannot be completed'; end if;

  update public.orders
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      duration_minutes = coalesce(duration_minutes, p_duration_minutes),
      final_price = coalesce(final_price, p_amount)
  where id = p_order_id;

  -- Keep driver reserved until payment is confirmed.
  update public.drivers set available = false where id = p_driver_id;

  select pc.code into v_code from public.payment_codes pc
  where pc.order_id = p_order_id and pc.driver_id = p_driver_id and pc.used = false
  order by pc.id desc limit 1;

  if v_code is null then
    for i in 1..25 loop
      v_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
      begin
        insert into public.payment_codes(driver_id, order_id, code, amount, used)
        values (p_driver_id, p_order_id, v_code, p_amount, false);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then raise exception 'Could not allocate payment code'; end if;
  end if;

  return query select v_code;
end;
$$;

create or replace function public.confirm_payment_atomic(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_codes%rowtype;
begin
  select * into v_payment from public.payment_codes where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.used then return true; end if;

  update public.payment_codes set used = true where id = p_payment_id;
  update public.drivers set available = true where id = v_payment.driver_id;
  return true;
end;
$$;

-- Client roles cannot call privileged mutation functions directly.
revoke all on function public.refresh_order_driver_slots(uuid) from public, anon, authenticated;
revoke all on function public.select_customer_offer_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_offer_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_order_and_issue_payment(uuid, uuid, numeric, integer) from public, anon, authenticated;
revoke all on function public.confirm_payment_atomic(uuid) from public, anon, authenticated;

grant execute on function public.refresh_order_driver_slots(uuid) to service_role;
grant execute on function public.select_customer_offer_atomic(uuid, uuid) to service_role;
grant execute on function public.accept_offer_atomic(uuid, uuid) to service_role;
grant execute on function public.complete_order_and_issue_payment(uuid, uuid, numeric, integer) to service_role;
grant execute on function public.confirm_payment_atomic(uuid) to service_role;

-- Protect driver_invites from direct browser access.
-- All reads/writes go through authenticated Next.js server routes using service_role.
alter table public.driver_invites enable row level security;

revoke all on table public.driver_invites from public, anon, authenticated;
grant all on table public.driver_invites to service_role;

-- driver_invites intentionally stays OUT of Supabase Realtime publication.
-- Custom driver/customer sessions are validated by our server API, not by Supabase Auth,
-- so publishing this table to anonymous clients would leak invitation metadata.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_invites'
  ) then
    alter publication supabase_realtime drop table public.driver_invites;
  end if;
end $$;
