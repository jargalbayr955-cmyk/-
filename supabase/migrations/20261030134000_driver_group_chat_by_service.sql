create table if not exists public.driver_group_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_key text not null,
  sender_id uuid not null references public.drivers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '30 days'),
  constraint driver_group_messages_room_key check (char_length(room_key) between 1 and 80),
  constraint driver_group_messages_body check (char_length(body) between 1 and 2000)
);

create table if not exists public.driver_group_chat_reads (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  room_key text not null,
  last_read_at timestamptz not null default pg_catalog.now(),
  primary key (driver_id, room_key),
  constraint driver_group_chat_reads_room_key check (char_length(room_key) between 1 and 80)
);

create index if not exists driver_group_messages_room_created_idx
  on public.driver_group_messages(room_key, created_at desc);
create index if not exists driver_group_messages_expiry_idx
  on public.driver_group_messages(expires_at);

alter table public.driver_group_messages enable row level security;
alter table public.driver_group_chat_reads enable row level security;

revoke all on table public.driver_group_messages from public, anon, authenticated;
revoke all on table public.driver_group_chat_reads from public, anon, authenticated;
grant select, insert, update, delete on table public.driver_group_messages to service_role;
grant select, insert, update, delete on table public.driver_group_chat_reads to service_role;

create or replace function public.cleanup_driver_group_chat_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  delete from public.driver_group_messages
  where expires_at <= pg_catalog.now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$function$;

revoke all on function public.cleanup_driver_group_chat_history() from public, anon, authenticated;
grant execute on function public.cleanup_driver_group_chat_history() to service_role;

do $block$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'achilt-driver-group-chat-cleanup' limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
    perform cron.schedule(
      'achilt-driver-group-chat-cleanup',
      '31 * * * *',
      'select public.cleanup_driver_group_chat_history();'
    );
  end if;
end
$block$;
