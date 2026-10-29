-- Driver online/push reliability: heartbeat health, multi-device subscriptions and delivery ACKs.
alter table public.drivers
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists notification_health text not null default 'unknown',
  add column if not exists notification_checked_at timestamptz;

update public.drivers
set last_heartbeat_at = coalesce(last_heartbeat_at, location_updated_at)
where last_heartbeat_at is null and location_updated_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drivers_notification_health_check'
  ) then
    alter table public.drivers add constraint drivers_notification_health_check
      check (notification_health in ('unknown','ready','permission_default','permission_denied','unsupported','error','native'));
  end if;
end $$;

alter table public.push_subscriptions
  add column if not exists endpoint_hash text,
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists disabled_at timestamptz;

update public.push_subscriptions
set endpoint_hash = md5(coalesce(subscription->>'endpoint',''))
where endpoint_hash is null and coalesce(subscription->>'endpoint','') <> '';

-- Older versions kept one row per driver, but retries could have left duplicate endpoints.
delete from public.push_subscriptions older
using public.push_subscriptions newer
where older.driver_id = newer.driver_id
  and older.endpoint_hash is not null
  and older.endpoint_hash = newer.endpoint_hash
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index if not exists push_subscriptions_driver_endpoint_uidx
  on public.push_subscriptions(driver_id, endpoint_hash)
  where endpoint_hash is not null;
create index if not exists push_subscriptions_active_driver_idx
  on public.push_subscriptions(driver_id, disabled_at);

create table if not exists public.driver_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  kind text not null check (kind in ('order_invite','order_selected','driver_chat')),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  acked_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create index if not exists driver_push_deliveries_driver_created_idx
  on public.driver_push_deliveries(driver_id, created_at desc);
create index if not exists driver_push_deliveries_unacked_idx
  on public.driver_push_deliveries(expires_at)
  where acked_at is null;

alter table public.driver_push_deliveries enable row level security;
revoke all on table public.driver_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.driver_push_deliveries to service_role;

create or replace function public.cleanup_driver_push_deliveries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.driver_push_deliveries
  where created_at < now() - interval '7 days'
     or expires_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_driver_push_deliveries() from public, anon, authenticated;
grant execute on function public.cleanup_driver_push_deliveries() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'achilt-push-delivery-cleanup';
    perform cron.schedule('achilt-push-delivery-cleanup', '25 * * * *', $job$select public.cleanup_driver_push_deliveries();$job$);
  end if;
exception when others then
  raise notice 'push delivery cleanup cron not changed: %', sqlerrm;
end $$;
