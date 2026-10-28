alter table public.users
  add column if not exists otp_registered_at timestamptz default pg_catalog.now();

update public.users
set otp_registered_at = null
where created_at < timestamp '2026-10-28 08:55:54.545';

update public.users
set otp_registered_at = created_at at time zone 'UTC'
where created_at >= timestamp '2026-10-28 08:55:54.545';

create index if not exists users_otp_registered_at_idx
  on public.users (otp_registered_at)
  where otp_registered_at is not null;
