alter table public.users
  add column if not exists last_seen_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.users
  drop constraint if exists users_presence_lat_check,
  add constraint users_presence_lat_check check (lat is null or (lat >= -90 and lat <= 90)),
  drop constraint if exists users_presence_lng_check,
  add constraint users_presence_lng_check check (lng is null or (lng >= -180 and lng <= 180));

create index if not exists users_presence_recent_idx
  on public.users (last_seen_at desc)
  where active = true and last_seen_at is not null;

revoke all on table public.users from anon, authenticated;
grant select, insert, update, delete on table public.users to service_role;
