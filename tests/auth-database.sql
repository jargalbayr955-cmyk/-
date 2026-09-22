-- Live authentication functions, with no accounts committed and no external messages.
DO $test$
declare
 u uuid; d uuid; rejected boolean; v_phone text := '+97600009981';
begin
 begin
  assert not exists(select 1 from public.users where users.phone=v_phone),'fixture phone must be unused';
  u:=public.register_customer_secure(v_phone,'851906');
  assert public.verify_customer_pin(v_phone,'851906')=u,'new customer must be able to log in';
  assert public.verify_customer_pin(v_phone,'000000') is null,'wrong PIN must be rejected';
  assert (select pin_hash <> '851906' from public.users where id=u),'PIN must be hashed';
  rejected:=false;
  begin perform public.register_customer_secure(v_phone,'123456');
  exception when raise_exception then rejected:=true;
  end;
  assert rejected,'duplicate registration must not change PIN';
  assert public.verify_customer_pin(v_phone,'851906')=u,'duplicate attempt must preserve original PIN';
  update public.users set active=false where id=u;
  assert public.verify_customer_pin(v_phone,'851906') is null,'disabled customer denied';
  d:=public.admin_create_driver_secure('+97600009982','QA auth rollback','851906','butten');
  assert public.verify_driver_pin('+97600009982','851906')=d,'admin-created driver can log in';
  perform public.set_driver_pin_secure(d,'690158');
  assert public.verify_driver_pin('+97600009982','851906') is null,'old driver PIN denied after change';
  assert public.verify_driver_pin('+97600009982','690158')=d,'new driver PIN works';
  update public.drivers set deleted_at=now() where id=d;
  assert public.verify_driver_pin('+97600009982','690158') is null,'deleted driver denied';
  raise exception 'rollback verified auth fixtures' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end $test$;
