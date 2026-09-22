-- No real accounts or orders are committed; no push services are called.
begin;
set local role service_role;
do $test$
declare
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); k uuid:=gen_random_uuid();
 a jsonb; b jsonb; v uuid; v2 uuid; denied boolean;
 payload jsonb:='{"from_lat":0,"from_lng":0,"from_address":"QA audit pickup","to_address":"QA audit destination","car_type":"butten","car_mark":"QA"}';
begin
 insert into public.users(id,phone,active) values(u,'+97600009970',true),(u2,'+97600009971',true);
 a:=public.create_customer_order_atomic(u,k,payload);
 b:=public.create_customer_order_atomic(u,k,payload);
 assert (a->>'created')::boolean and not (b->>'created')::boolean;
 assert a->'order'->>'id'=b->'order'->>'id','lost response reuses the order';
 assert (select count(*)=1 from public.orders where user_id=u and client_request_id=k);
 assert (select bidding_expires_at is not null from public.orders where id=(a->'order'->>'id')::uuid),'creation includes dispatch atomically';
 denied:=false;
 begin perform public.create_customer_order_atomic(u,k,payload||'{"to_address":"Changed"}'::jsonb);
 exception when sqlstate '22023' then denied:=true; end;
 assert denied,'a key cannot overwrite its original order';
 b:=public.create_customer_order_atomic(u2,k,payload);
 assert a->'order'->>'id'<>b->'order'->>'id','keys are scoped to the authenticated customer';
 update public.users set active=false where id=u;
 denied:=false;
 begin perform public.create_customer_order_atomic(u,gen_random_uuid(),payload);
 exception when insufficient_privilege then denied:=true; end;
 assert denied,'disabled accounts cannot dispatch';
 assert not has_function_privilege('anon','public.create_customer_order_atomic(uuid,uuid,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.verify_driver_device(text,text)','execute');
 insert into public.drivers(id,phone,name,active,available,pin) values(d,'+97600009972','QA audit driver',true,false,null);
 perform public.set_driver_pin_secure(d,'572918');
 select session_version into v from public.verify_driver_device('+97600009972','572918');
 assert v is not null,'a PIN has a session version';
 assert not exists(select 1 from public.verify_driver_device('+97600009972','111111'));
 update public.drivers set lat=0,lng=0,location_updated_at=now() where id=d;
 assert (select session_version=v from public.drivers where id=d),'GPS must not revoke login';
 perform public.set_driver_pin_secure(d,'817295');
 select session_version into v2 from public.verify_driver_device('+97600009972','817295');
 assert v2 is not null and v<>v2,'PIN reset rotates all old devices';
 assert not exists(select 1 from public.verify_driver_device('+97600009972','572918'));
 update public.drivers set active=false where id=d;
 update public.drivers set active=true where id=d;
 assert (select session_version<>v2 from public.drivers where id=d),'reenabling cannot revive an old device';
end $test$;
rollback;
