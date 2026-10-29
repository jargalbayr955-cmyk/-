create table if not exists public.driver_chat_threads (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  driver_a uuid not null references public.drivers(id) on delete cascade,
  driver_b uuid not null references public.drivers(id) on delete cascade,
  last_message_body text,
  last_sender_id uuid references public.drivers(id) on delete set null,
  last_message_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  constraint driver_chat_threads_distinct check (driver_a <> driver_b),
  constraint driver_chat_threads_canonical check (driver_a::text < driver_b::text),
  constraint driver_chat_threads_pair_unique unique (driver_a, driver_b)
);

create table if not exists public.driver_chat_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  thread_id uuid not null references public.driver_chat_threads(id) on delete cascade,
  sender_id uuid not null references public.drivers(id) on delete cascade,
  recipient_id uuid not null references public.drivers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  expires_at timestamptz not null default (pg_catalog.now() + interval '30 days'),
  constraint driver_chat_messages_distinct check (sender_id <> recipient_id),
  constraint driver_chat_messages_body check (char_length(body) between 1 and 2000)
);

create index if not exists driver_chat_threads_a_last_idx on public.driver_chat_threads(driver_a, last_message_at desc);
create index if not exists driver_chat_threads_b_last_idx on public.driver_chat_threads(driver_b, last_message_at desc);
create index if not exists driver_chat_messages_thread_created_idx on public.driver_chat_messages(thread_id, created_at desc);
create index if not exists driver_chat_messages_unread_idx on public.driver_chat_messages(recipient_id, read_at, expires_at);
create index if not exists driver_chat_messages_expiry_idx on public.driver_chat_messages(expires_at);

alter table public.driver_chat_threads enable row level security;
alter table public.driver_chat_messages enable row level security;

revoke all on table public.driver_chat_threads from public, anon, authenticated;
revoke all on table public.driver_chat_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.driver_chat_threads to service_role;
grant select, insert, update, delete on table public.driver_chat_messages to service_role;

create or replace function public.send_driver_chat_message(p_sender uuid, p_peer uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_a uuid;
  v_b uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  if p_sender is null or p_peer is null or p_sender = p_peer then
    raise exception 'invalid_peer' using errcode = '22023';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_sender and d.active = true and d.deleted_at is null
  ) then
    raise exception 'sender_unavailable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.drivers d
    where d.id = p_peer and d.active = true and d.deleted_at is null
  ) then
    raise exception 'peer_unavailable' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders o
    where o.driver_id in (p_sender, p_peer) and o.status = 'confirmed'
  ) or exists (
    select 1 from public.payment_codes pc
    where pc.driver_id in (p_sender, p_peer) and pc.used = false
  ) then
    raise exception 'driver_busy' using errcode = 'P0001';
  end if;

  if p_sender::text < p_peer::text then
    v_a := p_sender; v_b := p_peer;
  else
    v_a := p_peer; v_b := p_sender;
  end if;

  insert into public.driver_chat_threads(driver_a, driver_b)
  values (v_a, v_b)
  on conflict (driver_a, driver_b) do nothing;

  select t.id into v_thread_id
  from public.driver_chat_threads t
  where t.driver_a = v_a and t.driver_b = v_b
  for update;

  insert into public.driver_chat_messages(thread_id, sender_id, recipient_id, body)
  values (v_thread_id, p_sender, p_peer, v_body)
  returning id, created_at into v_message_id, v_created_at;

  update public.driver_chat_threads
  set last_message_body = v_body,
      last_sender_id = p_sender,
      last_message_at = v_created_at
  where id = v_thread_id;

  return pg_catalog.jsonb_build_object(
    'id', v_message_id,
    'thread_id', v_thread_id,
    'body', v_body,
    'created_at', v_created_at
  );
end
$function$;

revoke all on function public.send_driver_chat_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.send_driver_chat_message(uuid, uuid, text) to service_role;

create or replace function public.cleanup_driver_chat_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  delete from public.driver_chat_messages
  where expires_at <= pg_catalog.now();
  get diagnostics v_deleted = row_count;

  delete from public.driver_chat_threads t
  where not exists (
    select 1 from public.driver_chat_messages m where m.thread_id = t.id
  );

  return v_deleted;
end
$function$;

revoke all on function public.cleanup_driver_chat_history() from public, anon, authenticated;
grant execute on function public.cleanup_driver_chat_history() to service_role;

do $block$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'achilt-driver-chat-cleanup' limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
    perform cron.schedule(
      'achilt-driver-chat-cleanup',
      '23 * * * *',
      'select public.cleanup_driver_chat_history();'
    );
  end if;
end
$block$;
