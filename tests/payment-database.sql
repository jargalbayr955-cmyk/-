-- Run through the authorized server connection. Every fixture rolls back in a subtransaction.
DO $test$
declare
 d uuid:=gen_random_uuid(); o1 uuid:=gen_random_uuid(); o2 uuid:=gen_random_uuid();
 c1 text; c2 text; p1 uuid; p2 uuid; rejected boolean; ids uuid[]:='{}'; did uuid;
 search_id uuid:=gen_random_uuid(); exp_id uuid:=gen_random_uuid(); offer1 uuid; offer2 uuid;
 r jsonb; i integer;
begin
 begin
  insert into public.drivers(id,name,phone,car_type,active,available,pin) values(d,'QA transaction only','+97600000001','butten',true,false,null);
  insert into public.orders(id,driver_id,status,final_price) values(o1,d,'confirmed',12500),(o2,d,'confirmed',18000);
  select code into c1 from public.complete_order_and_issue_payment(o1,d,1,12);
  assert (select amount=12500 from public.payment_codes where order_id=o1),'selected price must be authoritative';
  select code into c2 from public.complete_order_and_issue_payment(o1,d,1,12);
  assert c1=c2 and (select count(*)=1 from public.payment_codes where order_id=o1),'completion must reuse payment';
  assert (select available=false from public.drivers where id=d),'completion must block driver';
  rejected:=false;
  begin
   insert into public.payment_codes(driver_id,order_id,code,amount,used) values(d,o1,'qa-'||gen_random_uuid(),12500,false);
  exception when unique_violation then rejected:=true;
  end;
  assert rejected,'duplicate payment insert must fail';
  select id into p1 from public.payment_codes where order_id=o1;
  perform public.confirm_payment_atomic(p1);
  assert (select available=false from public.drivers where id=d),'another active trip must block availability';
  select code into c2 from public.complete_order_and_issue_payment(o1,d,1,12);
  assert c1=c2 and (select count(*)=1 from public.payment_codes where order_id=o1),'paid completion retry cannot create debt';
  select code into c2 from public.complete_order_and_issue_payment(o2,d,1,12);
  rejected:=false;
  begin update public.drivers set available=true where id=d;
  exception when check_violation then rejected:=true;
  end;
  assert rejected,'online update must fail while payment pending';
  select id into p2 from public.payment_codes where order_id=o2;
  perform public.confirm_payment_atomic(p1);
  assert (select available=false from public.drivers where id=d),'duplicate receipt must not release another unpaid trip';
  perform public.confirm_payment_atomic(p2);
  assert (select available=true from public.drivers where id=d),'all work paid should release active driver';
  update public.drivers set available=false where id=d;
  perform public.confirm_payment_atomic(p2);
  assert (select available=false from public.drivers where id=d),'duplicate receipt must preserve manual offline status';
  perform public.complete_order_and_issue_payment(o2,d,1,12);
  assert (select available=false from public.drivers where id=d),'paid completion retry must preserve manual offline status';
  -- Nine nearby test drivers, no push calls or committed invitations.
  for i in 1..9 loop
   did:=gen_random_uuid(); ids:=array_append(ids,did);
   insert into public.drivers(id,name,phone,car_type,active,available,lat,lng,pin)
   values(did,'QA nearest-8 rollback','+97600000002','butten',true,true,0.0001*i,0,null);
  end loop;
  insert into public.orders(id,status,from_lat,from_lng,from_address,to_address,car_type)
  values(search_id,'pending',0,0,'QA rollback','QA rollback','butten');
  r:=public.refresh_order_driver_slots(search_id);
  assert (r->>'inserted')::integer=8,'nearest eight must be invited';
  assert (select count(*)=8 from public.driver_invites where order_id=search_id and driver_id=any(ids[1:8])),'only eight nearest test drivers invited';
  assert (select bidding_expires_at-driver_invites_initialized_at=interval '10 minutes' from public.orders where id=search_id),'fixed ten-minute window';
  update public.drivers set available=false where id=ids[8];
  r:=public.refresh_order_driver_slots(search_id);
  assert (r->>'inserted')::integer=0 and (select count(*)=8 from public.driver_invites where order_id=search_id),'no rotation or replacement';
  r:=public.submit_driver_offer_atomic(search_id,ids[1],12500,0.0001,0); offer1:=(r->>'offer_id')::uuid;
  r:=public.submit_driver_offer_atomic(search_id,ids[2],15000,0.0002,0); offer2:=(r->>'offer_id')::uuid;
  perform public.select_customer_offer_atomic(search_id,offer1);
  assert (select status='confirmed' and driver_id=ids[1] and final_price=12500 from public.orders where id=search_id),'selection stores agreed price and driver';
  assert (select status='declined' from public.offers where id=offer2),'competing quote closes';
  rejected:=false;
  begin perform public.select_customer_offer_atomic(search_id,offer2);
  exception when raise_exception then rejected:=true;
  end;
  assert rejected,'second selection must fail';
  select code into c1 from public.complete_order_and_issue_payment(search_id,ids[1],1,10);
  select id into p1 from public.payment_codes where order_id=search_id;
  update public.drivers set active=false,available=false where id=ids[1];
  perform public.confirm_payment_atomic(p1);
  assert (select available=false from public.drivers where id=ids[1]),'payment cannot reactivate disabled driver';
  -- Expiry uses the actual database clock.
  insert into public.orders(id,status,from_lat,from_lng,car_type) values(exp_id,'pending',0,0,'butten');
  perform public.refresh_order_driver_slots(exp_id);
  update public.orders set bidding_expires_at=now()-interval '1 second' where id=exp_id;
  rejected:=false;
  begin perform public.submit_driver_offer_atomic(exp_id,ids[2],12500,0.0002,0);
  exception when raise_exception then rejected:=true;
  end;
  assert rejected,'expired search rejects new quotes';
  r:=public.refresh_order_driver_slots(exp_id);
  assert (r->>'expired')::boolean,'expiry reported';
  raise exception 'rollback verified test fixtures' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end $test$;
