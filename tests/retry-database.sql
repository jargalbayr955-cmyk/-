-- Fixtures are rolled back; no push calls or real customer writes.
DO $test$
declare
 u uuid; old_id uuid:=gen_random_uuid(); bad_id uuid:=gen_random_uuid();
 r jsonb; again jsonb; new_id uuid; rejected boolean;
begin
 begin
  u:=public.register_customer_secure('+97600009983','695186');
  insert into public.orders(id,user_id,user_phone,status,from_lat,from_lng,from_address,to_address,car_type,driver_invites_initialized_at,bidding_expires_at)
  values(old_id,u,'+97600009983','pending',0,0,'QA retry rollback','QA retry rollback','butten',now()-interval '11 minutes',now()-interval '1 minute');
  r:=public.retry_customer_order_atomic(old_id,u,'+97600009983'); new_id:=(r->'order'->>'id')::uuid;
  assert (r->>'created')::boolean,'first retry creates one search';
  again:=public.retry_customer_order_atomic(old_id,u,'+97600009983');
  assert not (again->>'created')::boolean and (again->'order'->>'id')::uuid=new_id,'lost response retry reuses same search';
  assert (select count(*)=1 from public.orders where retry_of_order_id=old_id),'only one replacement order';
  assert (select user_id=u and from_lat=0 and from_lng=0 and car_type='butten' from public.orders where id=new_id),'pickup and owner preserved';
  rejected:=false;
  begin perform public.retry_customer_order_atomic(new_id,u,'+97600009983');
  exception when raise_exception then rejected:=true;
  end;
  assert rejected,'cannot retry before deadline';
  rejected:=false;
  begin perform public.retry_customer_order_atomic(old_id,gen_random_uuid(),'+97600009984');
  exception when raise_exception then rejected:=true;
  end;
  assert rejected,'different owner cannot reuse existing retry';
  -- Missing location makes dispatch fail; insertion must be rolled back with it.
  insert into public.orders(id,user_id,user_phone,status,car_type,driver_invites_initialized_at,bidding_expires_at)
  values(bad_id,u,'+97600009983','pending','butten',now()-interval '11 minutes',now()-interval '1 minute');
  rejected:=false;
  begin perform public.retry_customer_order_atomic(bad_id,u,'+97600009983');
  exception when raise_exception then rejected:=true;
  end;
  assert rejected and not exists(select 1 from public.orders where retry_of_order_id=bad_id),'dispatch failure leaves no orphan replacement';
  assert not has_function_privilege('anon','public.retry_customer_order_atomic(uuid,uuid,text)','execute'),'anonymous retry RPC forbidden';
  assert not has_function_privilege('authenticated','public.retry_customer_order_atomic(uuid,uuid,text)','execute'),'client retry RPC forbidden';
  raise exception 'rollback verified retry fixtures' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end $test$;
