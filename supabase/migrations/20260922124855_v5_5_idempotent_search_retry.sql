-- One replacement search per expired order, even across devices or lost responses.
alter table public.orders
  add column retry_of_order_id uuid references public.orders(id) on delete set null;
create unique index orders_retry_of_order_id_key on public.orders(retry_of_order_id);

create function public.retry_customer_order_atomic(p_order_id uuid, p_customer_id uuid, p_customer_phone text)
returns jsonb
language plpgsql
security invoker
set search_path=public, extensions
as $$
declare
  v_old public.orders%rowtype;
  v_new public.orders%rowtype;
  v_refresh jsonb;
begin
  select * into v_old from public.orders where id=p_order_id for update;
  if not found or p_customer_id is null or p_customer_phone is null
    or (v_old.user_id is not null and v_old.user_id<>p_customer_id)
    or (v_old.user_id is null and v_old.user_phone is distinct from p_customer_phone)
  then raise exception 'Order not found'; end if;

  select * into v_new from public.orders where retry_of_order_id=p_order_id;
  if found then
    return jsonb_build_object('order',jsonb_build_object('id',v_new.id,'status',v_new.status,'created_at',v_new.created_at),
      'created',false,'bidding_expires_at',v_new.bidding_expires_at);
  end if;
  if v_old.status<>'pending' then raise exception 'Order already selected'; end if;
  if v_old.bidding_expires_at is null or now()<v_old.bidding_expires_at then
    raise exception 'Bidding still active';
  end if;

  insert into public.orders(user_id,user_phone,from_address,to_address,from_lat,from_lng,car_type,car_mark,status,retry_of_order_id)
  values(p_customer_id,p_customer_phone,v_old.from_address,v_old.to_address,v_old.from_lat,v_old.from_lng,v_old.car_type,v_old.car_mark,'pending',p_order_id)
  returning * into v_new;
  -- Dispatch shares the transaction: failure leaves no orphaned replacement order.
  v_refresh:=public.refresh_order_driver_slots(v_new.id);
  return jsonb_build_object('order',jsonb_build_object('id',v_new.id,'status',v_new.status,'created_at',v_new.created_at),
    'created',true,'bidding_expires_at',v_refresh->'bidding_expires_at','invited_count',v_refresh->'active_slots');
end $$;
revoke all on function public.retry_customer_order_atomic(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.retry_customer_order_atomic(uuid,uuid,text) to service_role;
