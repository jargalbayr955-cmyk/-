-- Achilt V5.6 production hardening.
-- All application reads/writes go through authenticated Next.js server routes using service_role.
-- Keep browser roles away from business tables even if an old permissive RLS policy existed.

revoke all on table
  public.users,
  public.drivers,
  public.orders,
  public.offers,
  public.payment_codes,
  public.push_subscriptions,
  public.settings
from anon, authenticated;

-- This is a trigger function and is never meant to be called as a public RPC.
revoke execute on function public.sync_driver_location() from PUBLIC, anon, authenticated;

-- Remove legacy permissive policies. service_role continues to bypass RLS for server routes.
drop policy if exists "Allow all" on public.users;

drop policy if exists "Allow all" on public.drivers;
drop policy if exists "Anyone can delete drivers" on public.drivers;
drop policy if exists "Anyone can insert drivers" on public.drivers;
drop policy if exists "Anyone can update drivers" on public.drivers;
drop policy if exists "drivers_delete" on public.drivers;
drop policy if exists "drivers_insert" on public.drivers;
drop policy if exists "drivers_read" on public.drivers;
drop policy if exists "drivers_update" on public.drivers;

drop policy if exists "Allow all offers" on public.offers;

drop policy if exists "Allow all orders" on public.orders;
drop policy if exists "orders_insert" on public.orders;
drop policy if exists "orders_read" on public.orders;
drop policy if exists "orders_update" on public.orders;

drop policy if exists "Anyone can insert payment_codes" on public.payment_codes;
drop policy if exists "Anyone can read payment_codes" on public.payment_codes;
drop policy if exists "Anyone can update payment_codes" on public.payment_codes;

drop policy if exists "Anyone can delete subscriptions" on public.push_subscriptions;
drop policy if exists "Anyone can insert subscriptions" on public.push_subscriptions;
drop policy if exists "Anyone can read subscriptions" on public.push_subscriptions;

drop policy if exists "Anyone can read settings" on public.settings;
drop policy if exists "Anyone can update settings" on public.settings;
