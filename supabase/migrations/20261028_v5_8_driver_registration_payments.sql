set lock_timeout = '5s';

create table if not exists public.driver_registration_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  car_type text not null check (car_type in ('butten','chiregch')),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','contacted')),
  payment_amount numeric,
  payment_confirmed_at timestamptz,
  driver_id uuid references public.drivers(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_amount is null or (payment_amount > 0 and payment_amount = trunc(payment_amount)))
);

alter table public.driver_registration_requests
  drop constraint if exists driver_registration_requests_phone_check,
  add constraint driver_registration_requests_phone_check check (phone ~ '^\+976[0-9]{8}$');

create index if not exists driver_registration_requests_status_idx
  on public.driver_registration_requests(status, created_at desc);

alter table public.driver_registration_requests enable row level security;
revoke all on table public.driver_registration_requests from public, anon, authenticated;
grant select, insert, update on table public.driver_registration_requests to service_role;

create or replace function public.start_driver_registration(p_phone text, p_car_type text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request public.driver_registration_requests%rowtype;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$' or p_car_type not in ('butten','chiregch') then raise exception 'Invalid driver registration' using errcode='22023'; end if;
  select * into v_request from public.driver_registration_requests where phone=p_phone for update;
  if found and v_request.status in ('paid','contacted') then
    return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'payment_amount',v_request.payment_amount,'expires_at',v_request.expires_at);
  end if;
  if exists(select 1 from public.drivers d where regexp_replace(d.phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g') and d.deleted_at is null) then raise exception 'Driver phone already exists' using errcode='23505'; end if;
  if found then
    update public.driver_registration_requests set car_type=p_car_type,status='awaiting_payment',payment_amount=null,payment_confirmed_at=null,driver_id=null,expires_at=now()+interval '24 hours',updated_at=now() where id=v_request.id returning * into v_request;
  else
    insert into public.driver_registration_requests(phone,car_type) values(p_phone,p_car_type) returning * into v_request;
  end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'expires_at',v_request.expires_at);
end $$;

create or replace function public.get_driver_registration_status(p_request_id uuid,p_phone text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_request public.driver_registration_requests%rowtype;
begin
  if p_request_id is null or p_phone is null or p_phone !~ '^\+976[0-9]{8}$' then raise exception 'Invalid registration lookup' using errcode='22023'; end if;
  select * into v_request from public.driver_registration_requests where id=p_request_id and phone=p_phone;
  if not found then raise exception 'Registration request not found' using errcode='P0002'; end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'car_type',v_request.car_type,'payment_amount',v_request.payment_amount,'payment_confirmed_at',v_request.payment_confirmed_at,'expires_at',v_request.expires_at);
end $$;

create or replace function public.confirm_driver_registration_payment(p_phone text,p_amount numeric)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request public.driver_registration_requests%rowtype; v_driver_id uuid;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$' or p_amount is null or p_amount<=0 or p_amount<>trunc(p_amount) then raise exception 'Invalid registration receipt' using errcode='22023'; end if;
  select * into v_request from public.driver_registration_requests where phone=p_phone for update;
  if not found then raise exception 'Unknown driver registration reference' using errcode='P0002'; end if;
  if v_request.status in ('paid','contacted') then
    if v_request.payment_amount is distinct from p_amount then raise exception 'Registration payment amount mismatch' using errcode='P0001'; end if;
    return jsonb_build_object('success',true,'already_confirmed',true,'request_id',v_request.id,'driver_id',v_request.driver_id);
  end if;
  if v_request.status<>'awaiting_payment' or v_request.expires_at<now() then raise exception 'Driver registration request expired' using errcode='P0002'; end if;
  select id into v_driver_id from public.drivers where regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g') and deleted_at is null order by created_at desc nulls last limit 1 for update;
  if v_driver_id is null then
    insert into public.drivers(phone,name,pin,pin_hash,car_type,available,active)
    values(p_phone,'Шинэ жолооч',null,extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf',10)),v_request.car_type,false,false)
    returning id into v_driver_id;
  end if;
  update public.driver_registration_requests set status='paid',payment_amount=p_amount,payment_confirmed_at=now(),driver_id=v_driver_id,updated_at=now() where id=v_request.id;
  return jsonb_build_object('success',true,'already_confirmed',false,'request_id',v_request.id,'driver_id',v_driver_id);
end $$;

revoke all on function public.start_driver_registration(text,text) from public,anon,authenticated;
revoke all on function public.get_driver_registration_status(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_driver_registration_payment(text,numeric) from public,anon,authenticated;
grant execute on function public.start_driver_registration(text,text) to service_role;
grant execute on function public.get_driver_registration_status(uuid,text) to service_role;
grant execute on function public.confirm_driver_registration_payment(text,numeric) to service_role;
