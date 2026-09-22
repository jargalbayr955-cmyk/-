-- A lost HTTP response must not dispatch a second logical booking.
alter table public.orders add column client_request_id uuid;
create unique index orders_customer_request_key on public.orders(user_id,client_request_id);

create function public.create_customer_order_atomic(p_customer_id uuid,p_request_id uuid,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 v_phone text; v_order public.orders%rowtype; v_created boolean; v_refresh jsonb;
begin
 if p_request_id is null or p_details is null or jsonb_typeof(p_details)<>'object'
  or jsonb_typeof(p_details->'from_lat') is distinct from 'number'
  or jsonb_typeof(p_details->'from_lng') is distinct from 'number'
  or not ((p_details->>'from_lat')::numeric between -90 and 90)
  or not ((p_details->>'from_lng')::numeric between -180 and 180)
  or jsonb_typeof(p_details->'from_address') is distinct from 'string'
  or jsonb_typeof(p_details->'to_address') is distinct from 'string'
  or length(btrim(p_details->>'from_address')) not between 1 and 500
  or length(btrim(p_details->>'to_address')) not between 1 and 500
  or coalesce(p_details->>'car_type','') not in ('butten','chiregch')
 then raise exception 'Invalid booking' using errcode='22023'; end if;
 select phone into v_phone from public.users where id=p_customer_id and active is true for share;
 if not found then raise exception 'Customer unavailable' using errcode='42501'; end if;
 insert into public.orders(user_id,user_phone,from_address,to_address,from_lat,from_lng,car_type,car_mark,status,client_request_id)
 values(p_customer_id,v_phone,btrim(p_details->>'from_address'),btrim(p_details->>'to_address'),
  (p_details->>'from_lat')::double precision,(p_details->>'from_lng')::double precision,
  p_details->>'car_type',left(coalesce(p_details->>'car_mark',''),120),'pending',p_request_id)
 on conflict (user_id,client_request_id) do nothing returning * into v_order;
 v_created:=found;
 if not v_created then
  select * into strict v_order from public.orders where user_id=p_customer_id and client_request_id=p_request_id;
  if v_order.from_address is distinct from btrim(p_details->>'from_address')
   or v_order.to_address is distinct from btrim(p_details->>'to_address')
   or v_order.from_lat is distinct from (p_details->>'from_lat')::double precision
   or v_order.from_lng is distinct from (p_details->>'from_lng')::double precision
   or v_order.car_type is distinct from p_details->>'car_type'
   or v_order.car_mark is distinct from left(coalesce(p_details->>'car_mark',''),120)
  then raise exception 'Booking request changed' using errcode='22023'; end if;
 else
  v_refresh:=public.refresh_order_driver_slots(v_order.id);
 end if;
 return jsonb_build_object('order',jsonb_build_object('id',v_order.id,'status',v_order.status,'created_at',v_order.created_at),'created',v_created);
end $$;
revoke all on function public.create_customer_order_atomic(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_customer_order_atomic(uuid,uuid,jsonb) to service_role;

-- Existing devices keep their session until a PIN/security-state change occurs.
alter table public.drivers add column session_version uuid;
create function public.rotate_driver_session_version()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
 if new.pin_hash is distinct from old.pin_hash or new.active is distinct from old.active
  or new.deleted_at is distinct from old.deleted_at then new.session_version:=gen_random_uuid(); end if;
 return new;
end $$;
revoke all on function public.rotate_driver_session_version() from public,anon,authenticated;
create trigger rotate_driver_session_version before update of pin_hash,active,deleted_at on public.drivers
 for each row execute function public.rotate_driver_session_version();

-- Read the PIN and its session version in the same database snapshot.
create function public.verify_driver_device(p_phone text,p_pin text)
returns table(id uuid,session_version uuid)
language sql security invoker set search_path='' as $$
 select d.id,d.session_version from public.drivers d
 where d.phone=p_phone and d.active and d.deleted_at is null
  and d.pin_hash is not null and d.pin_hash=extensions.crypt(p_pin,d.pin_hash)
 limit 1;
$$;
revoke all on function public.verify_driver_device(text,text) from public,anon,authenticated;
grant execute on function public.verify_driver_device(text,text) to service_role;
