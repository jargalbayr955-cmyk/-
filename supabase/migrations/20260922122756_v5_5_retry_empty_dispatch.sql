create or replace function public.refresh_order_driver_slots(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_from geography(point,4326);
  v_inserted integer := 0;
  v_active integer := 0;
  v_expires timestamptz;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;

  if v_order.status <> 'pending' then
    update public.driver_invites
    set status = 'rejected'
    where order_id = p_order_id and status in ('active','offered');
    return jsonb_build_object(
      'inserted',0,'active_slots',0,'order_status',v_order.status,
      'expired',true,'bidding_expires_at',v_order.bidding_expires_at
    );
  end if;

  if v_order.from_lat is null or v_order.from_lng is null then
    raise exception 'Order location missing';
  end if;

  -- Start the deadline once, even when no eligible driver is online yet.
  if v_order.driver_invites_initialized_at is null then
    v_expires := now() + interval '10 minutes';
    update public.orders
    set driver_invites_initialized_at = now(),
        bidding_expires_at = v_expires
    where id = p_order_id;

  else
    v_expires := v_order.bidding_expires_at;
  end if;

  -- Absolute ten-minute deadline. Offered drivers are closed too if customer did not choose in time.
  if v_expires is not null and now() >= v_expires then
    update public.driver_invites
    set status = 'expired'
    where order_id = p_order_id and status in ('active','offered');

    update public.offers
    set status = 'declined'
    where order_id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'inserted',v_inserted,'active_slots',0,'order_status','pending',
      'expired',true,'bidding_expires_at',v_expires
    );
  end if;

  -- An empty search may acquire its first batch later. Once any invitation exists,
  -- freeze that batch: never rotate, replace, or extend the original deadline.
  if not exists(select 1 from public.driver_invites where order_id=p_order_id) then
    v_from := st_setsrid(
      st_makepoint(v_order.from_lng::double precision, v_order.from_lat::double precision),4326
    )::geography;

    insert into public.driver_invites(order_id,driver_id,rank,status,invited_at,expires_at)
    select p_order_id,
           d.id,
           row_number() over(order by st_distance(d.location,v_from),d.id)::integer,
           'active',
           now(),
           v_expires
    from public.drivers d
    where d.active = true
      and d.deleted_at is null
      and d.available = true
      and d.location is not null
      and d.location_updated_at >= now() - interval '2 minutes'
      and d.car_type in ('butten','chiregch')
      and (v_order.car_type is null or d.car_type = v_order.car_type)
      and not exists(select 1 from public.payment_codes pc where pc.driver_id=d.id and pc.used is not true)
      and not exists(
        select 1 from public.orders busy
        where busy.driver_id = d.id and busy.status = 'confirmed'
      )
    order by st_distance(d.location,v_from),d.id
    limit 8
    on conflict(order_id,driver_id) do nothing;

    get diagnostics v_inserted = row_count;
  end if;

  -- Keep status in sync for drivers who already quoted. No replacements are ever inserted.
  update public.driver_invites di
  set status = 'offered', offered_at = coalesce(di.offered_at,now())
  where di.order_id = p_order_id
    and di.status = 'active'
    and exists(
      select 1 from public.offers o
      where o.order_id = di.order_id
        and o.driver_id = di.driver_id
        and o.status = 'pending'
    );

  select count(*) into v_active
  from public.driver_invites
  where order_id = p_order_id and status in ('active','offered');

  return jsonb_build_object(
    'inserted',v_inserted,'active_slots',v_active,'order_status','pending',
    'expired',false,'bidding_expires_at',v_expires
  );
end $$;

revoke all on function public.refresh_order_driver_slots(uuid) from public, anon, authenticated;
grant execute on function public.refresh_order_driver_slots(uuid) to service_role;

-- Driver polling also dispatches waiting searches when the customer tab is asleep.
-- Only the server can call this; it passes the authenticated driver's ID.
create or replace function public.refresh_waiting_orders_for_driver(p_driver_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public, extensions
as $$
declare
  v_driver public.drivers%rowtype;
  v_order record;
  v_result jsonb;
  v_orders jsonb := '[]'::jsonb;
begin
  select * into v_driver from public.drivers where id=p_driver_id;
  if not found or v_driver.active is not true or v_driver.deleted_at is not null
    or v_driver.available is not true or v_driver.location is null
    or v_driver.location_updated_at is null
    or v_driver.location_updated_at < now()-interval '2 minutes'
    or v_driver.car_type is null or v_driver.car_type not in ('butten','chiregch')
    or exists(select 1 from public.orders where driver_id=p_driver_id and status='confirmed')
    or exists(select 1 from public.payment_codes where driver_id=p_driver_id and used is not true)
  then return jsonb_build_object('order_ids',v_orders); end if;

  for v_order in
    select o.id from public.orders o
    where o.status='pending'
      and (o.car_type is null or o.car_type=v_driver.car_type)
      and (o.bidding_expires_at > now() or
        (o.driver_invites_initialized_at is null and o.created_at > now()-interval '10 minutes'))
      and not exists(select 1 from public.driver_invites i where i.order_id=o.id)
    order by o.created_at desc
    limit 20
    for update of o skip locked
  loop
    v_result := public.refresh_order_driver_slots(v_order.id);
    if (v_result->>'inserted')::integer > 0 then
      v_orders := v_orders || jsonb_build_array(v_order.id);
    end if;
  end loop;
  return jsonb_build_object('order_ids',v_orders);
end $$;
revoke all on function public.refresh_waiting_orders_for_driver(uuid) from public, anon, authenticated;
grant execute on function public.refresh_waiting_orders_for_driver(uuid) to service_role;
