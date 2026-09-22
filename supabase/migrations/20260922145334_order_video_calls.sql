-- SDP is temporary negotiation metadata, not a video recording.
create schema if not exists achilt_private;
revoke all on schema achilt_private from public, anon, authenticated;
create table achilt_private.video_calls (
 id uuid primary key,
 order_id uuid not null references public.orders(id) on delete cascade,
 customer_id uuid not null references public.users(id) on delete cascade,
 driver_id uuid not null references public.drivers(id) on delete cascade,
 caller_role text not null check(caller_role in ('customer','driver')),
 caller_instance uuid not null,
 callee_instance uuid,
 status text not null check(status in ('ringing','active','ended','declined','missed')),
 offer_sdp text check(octet_length(offer_sdp)<=65536),
 answer_sdp text check(octet_length(answer_sdp)<=65536),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 caller_seen_at timestamptz not null default now(),
 callee_seen_at timestamptz,
 ended_at timestamptz
);
alter table achilt_private.video_calls enable row level security;
revoke all on achilt_private.video_calls from public, anon, authenticated;
create unique index video_calls_one_live_order on achilt_private.video_calls(order_id) where status in ('ringing','active');
create index video_calls_order_created on achilt_private.video_calls(order_id,created_at desc);
create index video_calls_customer on achilt_private.video_calls(customer_id);
create index video_calls_driver on achilt_private.video_calls(driver_id);
create index video_calls_expiry on achilt_private.video_calls(expires_at) where status in ('ringing','active');

create function public.manage_order_video_call(
 p_order_id uuid, p_actor_id uuid, p_role text, p_instance uuid,
 p_action text, p_call_id uuid default null, p_sdp text default null, p_enabled boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 o public.orders%rowtype; c achilt_private.video_calls%rowtype;
 v_customer_id uuid; own_call boolean; created boolean:=false;
begin
 if p_actor_id is null or p_order_id is null or p_role is null or p_action is null or p_role not in ('customer','driver') or p_action not in ('state','start','answer','end','decline') or p_instance is null then raise exception 'Not allowed'; end if;
 -- Serialize simultaneous calls/answers with the same lock used by order completion.
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.status<>'confirmed' or o.driver_id is null then raise exception 'Order unavailable'; end if;
 select u.id into v_customer_id from public.users u where u.active and
   ((o.user_id is not null and u.id=o.user_id) or (o.user_id is null and u.phone=o.user_phone)) limit 1;
 if v_customer_id is null then raise exception 'Not allowed'; end if;
 if p_role='customer' then
   if p_actor_id<>v_customer_id then raise exception 'Not allowed'; end if;
 else
   if p_actor_id<>o.driver_id or not exists(select 1 from public.drivers d where d.id=p_actor_id and d.active and d.deleted_at is null) then raise exception 'Not allowed'; end if;
 end if;
 if not exists(select 1 from public.drivers d where d.id=o.driver_id and d.active and d.deleted_at is null) then raise exception 'Not allowed'; end if;

 update achilt_private.video_calls set status=case when status='ringing' then 'missed' else 'ended' end,
   offer_sdp=null,answer_sdp=null,ended_at=now()
 where order_id=o.id and status in ('ringing','active') and
   (expires_at<=now() or v_customer_id<>video_calls.customer_id or driver_id<>o.driver_id or
    (status='active' and (caller_seen_at<now()-interval '45 seconds' or callee_seen_at<now()-interval '45 seconds')));

 if p_action='start' then
   if not coalesce(p_enabled,false) then raise exception 'Video disabled'; end if;
   if p_call_id is null or p_sdp is null or octet_length(p_sdp)>65536 or left(p_sdp,3)<>'v=0' then raise exception 'Not allowed'; end if;
   select * into c from achilt_private.video_calls where id=p_call_id;
   if found then
     if c.order_id<>o.id or c.caller_role<>p_role or c.caller_instance<>p_instance then raise exception 'Call busy'; end if;
     -- Repeating a lost start response never creates another call or restarts a finished call.
   else
     if exists(select 1 from achilt_private.video_calls where order_id=o.id and status in ('ringing','active')) then raise exception 'Call busy'; end if;
     insert into achilt_private.video_calls(id,order_id,customer_id,driver_id,caller_role,caller_instance,status,offer_sdp,expires_at)
       values(p_call_id,o.id,v_customer_id,o.driver_id,p_role,p_instance,'ringing',p_sdp,now()+interval '60 seconds') returning * into c;
     created:=true;
   end if;
 elsif p_action='state' then
   select * into c from achilt_private.video_calls where order_id=o.id order by created_at desc,id desc limit 1;
 else
   select * into c from achilt_private.video_calls where id=p_call_id and order_id=o.id;
   if not found then raise exception 'Call unavailable'; end if;
   if p_action='answer' then
     if p_role=c.caller_role then raise exception 'Not allowed'; end if;
     if c.status='active' and c.callee_instance=p_instance then null; -- idempotent answer retry
     elsif c.status<>'ringing' then raise exception 'Other device';
     else
       if not coalesce(p_enabled,false) then raise exception 'Video disabled'; end if;
       if p_sdp is null or octet_length(p_sdp)>65536 or left(p_sdp,3)<>'v=0' then raise exception 'Not allowed'; end if;
       update achilt_private.video_calls set status='active',callee_instance=p_instance,answer_sdp=p_sdp,
         callee_seen_at=now(),expires_at=now()+interval '10 minutes' where id=c.id returning * into c;
     end if;
   elsif c.status in ('ringing','active') then
     if p_role=c.caller_role and c.caller_instance<>p_instance then raise exception 'Other device'; end if;
     if p_role<>c.caller_role and c.status='active' and c.callee_instance<>p_instance then raise exception 'Other device'; end if;
     if p_action='decline' and (p_role=c.caller_role or c.status<>'ringing') then raise exception 'Not allowed'; end if;
     update achilt_private.video_calls set status=case when p_action='decline' then 'declined' else 'ended' end,
       offer_sdp=null,answer_sdp=null,ended_at=now() where id=c.id returning * into c;
   end if;
 end if;
 if c.id is null then return jsonb_build_object('call',null,'created',false); end if;
 own_call:=case when c.caller_role=p_role then c.caller_instance=p_instance else coalesce(c.callee_instance=p_instance,false) end;
 if own_call and c.status in ('ringing','active') then
   update achilt_private.video_calls set caller_seen_at=case when c.caller_role=p_role then now() else caller_seen_at end,
     callee_seen_at=case when c.caller_role<>p_role then now() else callee_seen_at end where id=c.id;
 end if;
 return jsonb_build_object('created',created,'call',jsonb_build_object(
   'id',c.id,'status',c.status,'caller_role',c.caller_role,'owned',own_call,'expires_at',c.expires_at,
   'offer_sdp',case when c.caller_role<>p_role and (c.status='ringing' or own_call) then c.offer_sdp else null end,
   'answer_sdp',case when c.caller_role=p_role and own_call then c.answer_sdp else null end
 ));
end $$;
revoke all on function public.manage_order_video_call(uuid,uuid,text,uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_order_video_call(uuid,uuid,text,uuid,text,uuid,text,boolean) to service_role;

create function achilt_private.end_order_video_call() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'confirmed' or new.driver_id is distinct from old.driver_id or new.user_id is distinct from old.user_id then
   update achilt_private.video_calls set status='ended',offer_sdp=null,answer_sdp=null,ended_at=now()
   where order_id=new.id and status in ('ringing','active');
 end if;
 return new;
end $$;
revoke all on function achilt_private.end_order_video_call() from public,anon,authenticated;
create trigger end_order_video_call after update of status,driver_id,user_id on public.orders
 for each row execute function achilt_private.end_order_video_call();

-- Cleanup still runs after both browsers are closed. Keep only one day of call metadata.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('achilt-video-cleanup','* * * * *',$job$
 update achilt_private.video_calls set status=case when status='ringing' then 'missed' else 'ended' end,
 offer_sdp=null,answer_sdp=null,ended_at=now() where status in ('ringing','active') and
 (expires_at<=now() or (status='active' and (caller_seen_at<now()-interval '45 seconds' or callee_seen_at<now()-interval '45 seconds')));
 delete from achilt_private.video_calls where ended_at<now()-interval '1 day';
$job$);
