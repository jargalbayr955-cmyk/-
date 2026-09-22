-- All fixtures and invitations roll back. No external notifications are sent.
DO $test$
declare
 d uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
 expired_order uuid:=gen_random_uuid(); mismatch uuid:=gen_random_uuid();
 deadline timestamptz; r jsonb;
begin
 begin
  insert into public.drivers(id,name,phone,car_type,active,available,lat,lng,pin)
  values(d,'QA dispatch rollback','+97600000003','butten',true,false,0,0,null),
        (d2,'QA dispatch rollback','+97600000004','butten',true,false,0.001,0,null);
  insert into public.orders(id,status,from_lat,from_lng,car_type)
  values(o,'pending',0,0,'butten');
  r:=public.refresh_order_driver_slots(o);
  assert (r->>'inserted')::integer=0,'offline driver must not receive order';
  select bidding_expires_at into deadline from public.orders where id=o;
  update public.drivers set available=true,location_updated_at=now()-interval '3 minutes' where id=d;
  r:=public.refresh_waiting_orders_for_driver(d);
  assert not exists(select 1 from public.driver_invites where order_id=o),'stale driver must not receive order';
  update public.drivers set lat=0,lng=0,location_updated_at=now() where id=d;
  r:=public.refresh_waiting_orders_for_driver(d);
  assert r->'order_ids' @> jsonb_build_array(o),'driver polling must recover empty search';
  assert (select count(*)=1 from public.driver_invites where order_id=o and driver_id=d),'eligible driver receives exactly one invitation';
  assert (select bidding_expires_at=deadline from public.orders where id=o),'retry must preserve original deadline';
  update public.drivers set available=true where id=d2;
  r:=public.refresh_order_driver_slots(o);
  assert (r->>'inserted')::integer=0,'first nonempty batch remains frozen';
  assert (select count(*)=1 from public.driver_invites where order_id=o),'no replacement or extra drivers';
  insert into public.orders(id,status,from_lat,from_lng,car_type,driver_invites_initialized_at,bidding_expires_at)
  values(expired_order,'pending',0,0,'butten',now()-interval '11 minutes',now()-interval '1 minute'),
        (mismatch,'pending',0,0,'chiregch',now(),now()+interval '10 minutes');
  r:=public.refresh_order_driver_slots(expired_order);
  assert (r->>'expired')::boolean and (r->>'inserted')::integer=0,'expired empty order cannot reopen';
  r:=public.refresh_waiting_orders_for_driver(d);
  assert not exists(select 1 from public.driver_invites where order_id=expired_order),'poll cannot revive expired order';
  assert not exists(select 1 from public.driver_invites where order_id=mismatch),'poll must respect vehicle type';
  assert not has_function_privilege('anon','public.refresh_waiting_orders_for_driver(uuid)','execute'),'anonymous RPC forbidden';
  assert not has_function_privilege('authenticated','public.refresh_waiting_orders_for_driver(uuid)','execute'),'client RPC forbidden';
  assert has_function_privilege('service_role','public.refresh_waiting_orders_for_driver(uuid)','execute'),'server RPC allowed';
  raise exception 'rollback verified dispatch fixtures' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end $test$;
