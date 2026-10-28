do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'achilt-dispatch-cleanup';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'achilt-dispatch-cleanup',
    '15 * * * *',
    'select public.cleanup_stale_dispatch_orders();'
  );
end;
$$;
