-- Search the whole unpaid queue before pagination; never filter only the dashboard's first 200 rows.
create or replace function public.admin_search_driver_payments(p_search text default '', p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (
    select regexp_replace(upper(left(coalesce(p_search, ''), 40)), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g') as value
  ), matches as (
    select o.id, pc.driver_id, coalesce(d.name, o.driver_name)::text as driver_name,
      coalesce(d.phone, o.driver_phone)::text as driver_phone, d.car_number,
      o.from_address, o.to_address, pc.code, pc.amount, o.completed_at
    from public.payment_codes pc
    join public.orders o on o.id = pc.order_id
    left join public.drivers d on d.id = pc.driver_id
    cross join term t
    where pc.used is not true and o.status = 'completed'
      and (btrim(coalesce(p_search, '')) = '' or (t.value <> '' and (
        position(t.value in regexp_replace(upper(coalesce(d.car_number, '')), '[^0-9A-ZА-ЯӨҮЁ]', '', 'g')) > 0
        or position(t.value in regexp_replace(coalesce(d.phone, o.driver_phone, ''), '[^0-9]', '', 'g')) > 0
      )))
  ), page as (
    select * from matches order by completed_at asc nulls last, id
    limit 50 offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object('payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.completed_at asc nulls last, p.id) from page p), '[]'::jsonb),
    'total', (select count(*) from matches));
$$;
revoke all on function public.admin_search_driver_payments(text, integer) from public, anon, authenticated;
grant execute on function public.admin_search_driver_payments(text, integer) to service_role;
