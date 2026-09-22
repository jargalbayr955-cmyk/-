-- One server-managed administrator credential. Never store plaintext passwords here.
create table public.admin_credentials (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null check (password_hash ~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$'),
  session_version uuid not null default gen_random_uuid(),
  must_change_password boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_credentials enable row level security;
revoke all on table public.admin_credentials from public, anon, authenticated;
revoke all on table public.admin_credentials from service_role;
grant select, insert, update on table public.admin_credentials to service_role;

comment on table public.admin_credentials is 'Server-only password hashes. Changing session_version revokes every prior admin session.';
-- Bootstrap/reset is an explicit service-role operation, outside migrations and git.
-- No browser policies: authenticated customers and drivers must never read this table.
