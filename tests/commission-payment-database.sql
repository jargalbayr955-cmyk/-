-- All receipts and drivers in this script exist only within the rolled-back transaction.
begin;
set local role service_role;
do $test$
declare
 d uuid:=gen_random_uuid(); disabled_driver uuid:=gen_random_uuid(); free_driver uuid:=gen_random_uuid();
 o uuid:=gen_random_uuid(); o2 uuid:=gen_random_uuid(); disabled_order uuid:=gen_random_uuid(); free_order uuid:=gen_random_uuid();
 c text; c2 text; c_disabled text; result jsonb; invoice record; rejected boolean; wrong numeric;
begin
 assert public.driver_commission(112820)=5500,'5641 fee rounds to 5500';
 assert public.driver_commission(115000)=6000,'5750 half step rounds up';
 assert public.driver_commission(100000)=5000 and public.driver_commission(200000)=10000;
 assert public.driver_commission(4999)=0 and public.driver_commission(5000)=500;
 assert not has_function_privilege('anon','public.confirm_driver_commission(text,numeric)','execute');
 assert not has_function_privilege('authenticated','public.confirm_driver_commission(text,numeric)','execute');
 assert not has_function_privilege('authenticated','public.complete_order_and_issue_commission(uuid,uuid,integer)','execute');
 assert not has_function_privilege('service_role','public.complete_order_and_issue_payment(uuid,uuid,numeric,integer)','execute'),'old amount response must be disabled';
 insert into public.drivers(id,name,phone,car_type,active,available,pin)
 values(d,'Commission QA rollback','+97600000011','butten',true,false,null),
       (disabled_driver,'Commission disabled QA rollback','+97600000012','butten',true,false,null),
       (free_driver,'Commission waived QA rollback','+97600000013','butten',true,false,null);
 insert into public.orders(id,driver_id,status,final_price)
 values(o,d,'confirmed',112820),(disabled_order,disabled_driver,'confirmed',100000),(free_order,free_driver,'confirmed',4999);
 select * into invoice from public.complete_order_and_issue_commission(o,d,10); c:=invoice.code;
 assert invoice.amount=5500 and invoice.fare_amount=112820 and not invoice.paid;
 assert c ~ '^[0-9]{6}$';
 assert (select not available from public.drivers where id=d),'completion blocks new jobs';
 select * into invoice from public.complete_order_and_issue_commission(o,d,999);
 assert invoice.code=c and invoice.amount=5500,'completion retries keep the same fee and reference';
 foreach wrong in array array[0,1,5499,5501,5641,6000,5500.01]::numeric[] loop
   rejected:=false;
   begin perform public.confirm_driver_commission(c,wrong);
   exception when sqlstate '22023' or sqlstate 'P0001' then rejected:=true; end;
   assert rejected,'a mismatching amount must fail';
   assert (select not used from public.payment_codes where code=c),'failed match must not pay';
 end loop;
 rejected:=false;
 begin perform public.confirm_driver_commission('bad-code',5500);
 exception when sqlstate '22023' then rejected:=true; end;
 assert rejected,'invalid reference must fail';
 -- A different order's valid code with this amount cannot release this driver.
 select code into c_disabled from public.complete_order_and_issue_commission(disabled_order,disabled_driver,10);
 rejected:=false;
 begin perform public.confirm_driver_commission(c_disabled,5500);
 exception when sqlstate 'P0001' then rejected:=true; end;
 assert rejected and (select not used from public.payment_codes where code=c_disabled);
 result:=public.confirm_driver_commission(c,5500);
 assert (result->>'success')::boolean and not (result->>'already_confirmed')::boolean and (result->>'available')::boolean;
 assert (select used and approved_via='macrodroid' and approved_at is not null and approved_by_session_version is null from public.payment_codes where code=c),'receipt audit is stored';
 update public.drivers set available=false where id=d;
 result:=public.confirm_driver_commission(c,5500);
 assert (result->>'already_confirmed')::boolean and not (result->>'available')::boolean,'duplicate SMS must preserve offline state';
 -- A previous receipt must not settle another trip from the same driver.
 insert into public.orders(id,driver_id,status,final_price) values(o2,d,'confirmed',200000);
 select code into c2 from public.complete_order_and_issue_commission(o2,d,10);
 result:=public.confirm_driver_commission(c,5500);
 assert not (result->>'available')::boolean and (result->>'pending_payments')::integer=1;
 assert (select not used from public.payment_codes where code=c2);
 result:=public.confirm_driver_commission(c2,10000);
 assert (result->>'available')::boolean;
 -- Paying cannot reactivate an administrator-disabled driver.
 update public.drivers set active=false,available=false where id=disabled_driver;
 result:=public.confirm_driver_commission(c_disabled,5000);
 assert not (result->>'available')::boolean;
 select * into invoice from public.complete_order_and_issue_commission(free_order,free_driver,10);
 assert invoice.amount=0 and invoice.paid,'a rounded zero fee is waived without asking for a transfer';
 assert (select available from public.drivers where id=free_driver);
end $test$;
rollback;
