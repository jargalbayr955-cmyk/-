alter table public.orders
  add column if not exists service_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='orders_service_details_object_check'
      and conrelid='public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_service_details_object_check
      check (jsonb_typeof(service_details)='object');
  end if;
end $$;

create or replace function public.create_customer_order_atomic(
  p_customer_id uuid,
  p_request_id uuid,
  p_details jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_phone text;
  v_order public.orders%rowtype;
  v_created boolean;
  v_refresh jsonb;
  v_service_type text := coalesce(nullif(p_details->>'service_type',''),'achilt');
  v_car_type text := nullif(p_details->>'car_type','');
  v_to_address text;
  v_car_mark text;
  v_service_details jsonb := coalesce(p_details->'service_details','{}'::jsonb);
begin
  if p_request_id is null or p_details is null or jsonb_typeof(p_details)<>'object'
    or jsonb_typeof(p_details->'from_lat') is distinct from 'number'
    or jsonb_typeof(p_details->'from_lng') is distinct from 'number'
    or not ((p_details->>'from_lat')::numeric between -90 and 90)
    or not ((p_details->>'from_lng')::numeric between -180 and 180)
    or jsonb_typeof(p_details->'from_address') is distinct from 'string'
    or length(pg_catalog.btrim(p_details->>'from_address')) not between 1 and 500
    or v_service_type not in ('achilt','crane','excavator','car_start','bobcat','loader')
    or (v_service_type='achilt' and v_car_type not in ('butten','chiregch'))
    or (v_service_type<>'achilt' and v_car_type is not null)
    or jsonb_typeof(v_service_details)<>'object'
    or length(v_service_details::text)>5000
  then raise exception 'Invalid booking' using errcode='22023'; end if;

  if v_service_type='achilt' then
    if jsonb_typeof(p_details->'to_address') is distinct from 'string'
       or length(pg_catalog.btrim(p_details->>'to_address')) not between 1 and 500
       or jsonb_typeof(p_details->'car_mark') is distinct from 'string'
       or length(pg_catalog.btrim(p_details->>'car_mark')) not between 1 and 120
    then raise exception 'Invalid booking' using errcode='22023'; end if;
    v_to_address := pg_catalog.btrim(p_details->>'to_address');
    v_car_mark := pg_catalog.btrim(p_details->>'car_mark');
    v_service_details := '{}'::jsonb;
  else
    v_to_address := '';
    v_car_mark := '';
  end if;

  select phone into v_phone from public.users where id=p_customer_id and active is true for share;
  if not found then raise exception 'Customer unavailable' using errcode='42501'; end if;

  insert into public.orders(
    user_id,user_phone,from_address,to_address,from_lat,from_lng,
    service_type,car_type,car_mark,service_details,status,client_request_id
  ) values(
    p_customer_id,v_phone,pg_catalog.btrim(p_details->>'from_address'),v_to_address,
    (p_details->>'from_lat')::double precision,(p_details->>'from_lng')::double precision,
    v_service_type,v_car_type,v_car_mark,v_service_details,'pending',p_request_id
  )
  on conflict (user_id,client_request_id) do nothing returning * into v_order;
  v_created:=found;

  if not v_created then
    select * into strict v_order from public.orders where user_id=p_customer_id and client_request_id=p_request_id;
    if v_order.from_address is distinct from pg_catalog.btrim(p_details->>'from_address')
      or v_order.from_lat is distinct from (p_details->>'from_lat')::double precision
      or v_order.from_lng is distinct from (p_details->>'from_lng')::double precision
      or v_order.service_type is distinct from v_service_type
      or v_order.car_type is distinct from v_car_type
      or v_order.to_address is distinct from v_to_address
      or v_order.car_mark is distinct from v_car_mark
      or coalesce(v_order.service_details,'{}'::jsonb) is distinct from v_service_details
    then raise exception 'Booking request changed' using errcode='22023'; end if;
  else
    v_refresh:=public.refresh_order_driver_slots(v_order.id);
  end if;

  return jsonb_build_object(
    'order',jsonb_build_object(
      'id',v_order.id,
      'status',v_order.status,
      'service_type',v_order.service_type,
      'created_at',v_order.created_at
    ),
    'created',v_created
  );
end $function$;
