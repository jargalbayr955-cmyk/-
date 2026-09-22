-- Transactional assertions only; fixtures and SDP roll back. No notifications or real calls.
DO $test$
declare
 u uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); r jsonb;
 s text:='v=0' || chr(13)||chr(10)||'m=audio 9 UDP/TLS/RTP/SAVPF 111';
begin
 begin
  insert into public.users(id,phone,active) values(u,'+97600000007',true);
  insert into public.drivers(id,name,phone,car_type,active,available,pin) values(d,'QA video rollback','+97600000008','butten',true,false,null);
  insert into public.orders(id,status,user_id,user_phone,driver_id,car_type) values(o,'confirmed',u,'+97600000007',d,'butten');
  begin perform public.manage_order_video_call(o,other,'customer',a,'state'); raise exception 'intruder allowed'; exception when raise_exception then if sqlerrm<>'Not allowed' then raise; end if; end;
  begin perform public.manage_order_video_call(o,null,'customer',a,'state'); raise exception 'null actor allowed'; exception when raise_exception then if sqlerrm<>'Not allowed' then raise; end if; end;
  begin perform public.manage_order_video_call(o,u,'customer',a,'start',c,s,false); raise exception 'unconfigured video allowed'; exception when raise_exception then if sqlerrm<>'Video disabled' then raise; end if; end;
  r:=public.manage_order_video_call(o,u,'customer',a,'start',c,s,true);
  assert (r->>'created')::boolean and (r->'call'->>'owned')::boolean,'caller creates own call';
  r:=public.manage_order_video_call(o,u,'customer',a,'start',c,s,true);
  assert not (r->>'created')::boolean,'lost start response is idempotent';
  begin perform public.manage_order_video_call(o,d,'driver',b,'start',other,s,true); raise exception 'simultaneous call allowed'; exception when raise_exception then if sqlerrm<>'Call busy' then raise; end if; end;
  r:=public.manage_order_video_call(o,u,'customer',other,'state');
  assert not (r->'call'->>'owned')::boolean and r->'call'->>'offer_sdp' is null,'other caller device receives no SDP';
  r:=public.manage_order_video_call(o,d,'driver',b,'state'); assert r->'call'->>'offer_sdp'=s,'callee sees incoming offer';
  begin perform public.manage_order_video_call(o,u,'customer',a,'answer',c,s,true); raise exception 'self answer allowed'; exception when raise_exception then if sqlerrm<>'Not allowed' then raise; end if; end;
  r:=public.manage_order_video_call(o,d,'driver',b,'answer',c,s,true); assert r->'call'->>'status'='active','callee accepts';
  r:=public.manage_order_video_call(o,d,'driver',b,'answer',c,s,true); assert (r->'call'->>'owned')::boolean,'answer retry succeeds';
  begin perform public.manage_order_video_call(o,d,'driver',other,'answer',c,s,true); raise exception 'second device took call'; exception when raise_exception then if sqlerrm<>'Other device' then raise; end if; end;
  begin perform public.manage_order_video_call(o,u,'customer',other,'end',c); raise exception 'other device ended call'; exception when raise_exception then if sqlerrm<>'Other device' then raise; end if; end;
  r:=public.manage_order_video_call(o,d,'driver',other,'state'); assert r->'call'->>'offer_sdp' is null,'other callee device receives no SDP after acceptance';
  r:=public.manage_order_video_call(o,u,'customer',a,'state'); assert r->'call'->>'answer_sdp'=s,'caller receives answer';
  r:=public.manage_order_video_call(o,d,'driver',b,'end',c); assert r->'call'->>'status'='ended','callee ends call';
  assert (select offer_sdp is null and answer_sdp is null from achilt_private.video_calls where id=c),'end wipes SDP';
  c:=gen_random_uuid(); r:=public.manage_order_video_call(o,d,'driver',a,'start',c,s,true);
  r:=public.manage_order_video_call(o,u,'customer',b,'decline',c); assert r->'call'->>'status'='declined','customer can decline driver call';
  c:=gen_random_uuid(); perform public.manage_order_video_call(o,u,'customer',a,'start',c,s,true);
  update achilt_private.video_calls set expires_at=now()-interval '1 second' where id=c;
  r:=public.manage_order_video_call(o,d,'driver',b,'state'); assert (select status='missed' and offer_sdp is null from achilt_private.video_calls where id=c),'ring timeout wipes SDP';
  c:=gen_random_uuid(); perform public.manage_order_video_call(o,u,'customer',a,'start',c,s,true);
  perform public.manage_order_video_call(o,d,'driver',b,'answer',c,s,true);
  update achilt_private.video_calls set caller_seen_at=now()-interval '46 seconds' where id=c;
  perform public.manage_order_video_call(o,d,'driver',b,'state'); assert (select status='ended' and answer_sdp is null from achilt_private.video_calls where id=c),'abandoned active call expires';
  c:=gen_random_uuid(); perform public.manage_order_video_call(o,u,'customer',a,'start',c,s,true);
  update public.orders set status='completed' where id=o;
  assert (select status='ended' and offer_sdp is null from achilt_private.video_calls where id=c),'order completion ends call';
  begin perform public.manage_order_video_call(o,u,'customer',a,'state'); raise exception 'completed order can call'; exception when raise_exception then if sqlerrm<>'Order unavailable' then raise; end if; end;
  assert not has_schema_privilege('anon','achilt_private','usage'),'anonymous schema forbidden';
  assert not has_table_privilege('authenticated','achilt_private.video_calls','select'),'direct client table forbidden';
  assert not has_function_privilege('anon','public.manage_order_video_call(uuid,uuid,text,uuid,text,uuid,text,boolean)','execute'),'anonymous RPC forbidden';
  assert not has_function_privilege('authenticated','public.manage_order_video_call(uuid,uuid,text,uuid,text,uuid,text,boolean)','execute'),'client RPC forbidden';
  assert has_function_privilege('service_role','public.manage_order_video_call(uuid,uuid,text,uuid,text,uuid,text,boolean)','execute'),'server RPC allowed';
  assert exists(select 1 from cron.job where jobname='achilt-video-cleanup' and active),'SDP cleanup scheduled';
  raise exception 'rollback verified video fixtures' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end $test$;
