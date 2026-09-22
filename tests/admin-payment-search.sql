-- Transaction-only fixtures: no real payment approvals, notifications or persistent users.
begin;
set local role service_role;
do $test$
declare
 d uuid := gen_random_uuid(); late_driver uuid := gen_random_uuid(); late_order uuid := gen_random_uuid();
 oid uuid; i integer; result jsonb; first_page jsonb; second_page jsonb;
 plate text := 'QA-' || replace(gen_random_uuid()::text, '-', '') || ' ӨҮЁ';
begin
 assert not has_function_privilege('anon','public.admin_search_driver_payments(text,integer)','execute');
 assert not has_function_privilege('authenticated','public.admin_search_driver_payments(text,integer)','execute');
 assert has_function_privilege('service_role','public.admin_search_driver_payments(text,integer)','execute');
 insert into public.drivers(id,name,phone,car_number,active,available,pin)
 values(d,'Search QA rollback','+97600000008',plate,true,false,null),
       (late_driver,'Late search QA rollback','+97600000009',plate || 'УБА',true,false,null);
 for i in 1..205 loop
   oid := gen_random_uuid();
   insert into public.orders(id,driver_id,status,completed_at,final_price)
   values(oid,d,'completed','1900-01-01'::timestamptz + i * interval '1 second',12500);
   insert into public.payment_codes(driver_id,order_id,code,amount,used)
   values(d,oid,'qa-'||gen_random_uuid(),12500,false);
 end loop;
 insert into public.orders(id,driver_id,status,completed_at,final_price)
 values(late_order,late_driver,'completed','2099-01-01'::timestamptz,18000);
 insert into public.payment_codes(driver_id,order_id,code,amount,used)
 values(late_driver,late_order,'qa-'||gen_random_uuid(),18000,false);
 result := public.admin_search_driver_payments(lower(replace(plate,'-',' ')),0);
 assert (result->>'total')::integer=206,'search must match lowercase Cyrillic, spaces and hyphens';
 assert jsonb_array_length(result->'payments')=50,'page size must stay bounded';
 first_page := result->'payments';
 result := public.admin_search_driver_payments(plate,50); second_page := result->'payments';
 assert not exists(select 1 from jsonb_array_elements(first_page) a join jsonb_array_elements(second_page) b on a->>'id'=b->>'id'),'pages must not repeat jobs';
 result := public.admin_search_driver_payments(plate,200);
 assert jsonb_array_length(result->'payments')=6,'last page must expose records beyond 200';
 result := public.admin_search_driver_payments(lower(plate||'уба'),0);
 assert (result->>'total')::integer=1 and result->'payments'->0->>'id'=late_order::text,'search must run before the result limit';
 assert result->'payments'->0->>'car_number'=plate||'УБА','show exact registered plate';
 result := public.admin_search_driver_payments('+976 0000-0009',0);
 assert exists(select 1 from jsonb_array_elements(result->'payments') p where p->>'id'=late_order::text),'formatted phone must match';
 result := public.admin_search_driver_payments('00000009',0);
 assert exists(select 1 from jsonb_array_elements(result->'payments') p where p->>'id'=late_order::text),'local phone must match country-prefixed storage';
 result := public.admin_search_driver_payments('%',0);
 assert (result->>'total')::integer=0,'wildcard must not list everybody';
 update public.payment_codes set used=true where order_id=late_order;
 result := public.admin_search_driver_payments(plate||'УБА',0);
 assert (result->>'total')::integer=0 and result->'payments'='[]'::jsonb,'approved jobs must leave search results';
end $test$;
rollback;
