-- A completed job stays locked until a current administrator approves it.
set lock_timeout = '5s';

alter table public.payment_codes
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_session_version uuid;

-- Disable the previous automatic entry point, including older deployments.
create or replace function public.confirm_payment_atomic(p_payment_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Administrator approval required' using errcode = '42501';
end $$;
revoke all on function public.confirm_payment_atomic(uuid) from public, anon, authenticated, service_role;

create or replace function public.admin_approve_driver_payment(p_order_id uuid, p_session_version uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payment_codes%rowtype;
  v_available boolean;
  v_pending bigint;
begin
  -- The server supplies the version from the verified admin cookie, never the body.
  perform 1 from public.admin_credentials
    where id = 1 and session_version = p_session_version and not must_change_password for share;
  if not found then raise exception 'Administrator session expired' using errcode = '42501'; end if;

  -- Match completion's lock order: order -> driver -> payment.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status is distinct from 'completed' or v_order.driver_id is null then
    raise exception 'Payment order unavailable';
  end if;
  perform 1 from public.drivers where id = v_order.driver_id for update;
  if not found then raise exception 'Payment driver unavailable'; end if;
  if (select count(*) from public.payment_codes where order_id = p_order_id) <> 1 then
    raise exception 'Payment record requires administrator review';
  end if;
  select * into v_payment from public.payment_codes where order_id = p_order_id for update;
  if v_payment.driver_id is distinct from v_order.driver_id
    or v_payment.amount is distinct from v_order.final_price then
    raise exception 'Payment does not match completed order';
  end if;

  if v_payment.used is not true then
    update public.payment_codes set used = true, approved_at = now(),
      approved_by_session_version = p_session_version where id = v_payment.id;
    update public.drivers d set available = (
      d.active is true and d.deleted_at is null and coalesce(d.car_type, '') in ('butten', 'chiregch')
      and not exists(select 1 from public.orders o where o.driver_id = d.id and o.status = 'confirmed')
      and not exists(select 1 from public.payment_codes pc where pc.driver_id = d.id and pc.used is not true)
    ) where d.id = v_order.driver_id;
  end if;
  -- Retries must not turn a resting driver online or release another debt.
  select available into v_available from public.drivers where id = v_order.driver_id;
  select count(*) into v_pending from public.payment_codes where driver_id = v_order.driver_id and used is not true;
  return jsonb_build_object('approved', true, 'already_approved', v_payment.used is true,
    'available', v_available, 'pending_payments', v_pending);
end $$;

create or replace function public.admin_pending_driver_payments()
returns table(id uuid, driver_id uuid, driver_name text, driver_phone text,
  from_address text, to_address text, code text, amount numeric,
  completed_at timestamptz, total_pending bigint)
language sql stable security invoker set search_path = '' as $$
  select o.id, pc.driver_id, coalesce(d.name, o.driver_name)::text,
    coalesce(d.phone, o.driver_phone)::text, o.from_address::text, o.to_address::text,
    pc.code::text, pc.amount::numeric, o.completed_at, count(*) over ()
  from public.payment_codes pc
  join public.orders o on o.id = pc.order_id
  left join public.drivers d on d.id = pc.driver_id
  where pc.used is not true and o.status = 'completed'
  order by o.completed_at asc nulls last, pc.id
  limit 200;
$$;

revoke all on function public.admin_approve_driver_payment(uuid, uuid),
  public.admin_pending_driver_payments() from public, anon, authenticated;
grant execute on function public.admin_approve_driver_payment(uuid, uuid),
  public.admin_pending_driver_payments() to service_role;
