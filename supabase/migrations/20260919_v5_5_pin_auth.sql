-- Achilt V5.5: customer phone + PIN authentication, no OTP flow.
-- Safe hardening: an existing phone cannot be claimed by assigning a new PIN.

set search_path = public, extensions;

create or replace function public.register_customer_secure(p_phone text, p_pin text)
returns uuid
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  v_id uuid;
begin
  if p_phone is null or p_phone !~ '^\+976[0-9]{8}$' or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Invalid registration';
  end if;

  -- Serialize registration attempts for one phone number.
  perform pg_advisory_xact_lock(hashtext(p_phone));

  select id into v_id
  from public.users
  where phone = p_phone
  order by id
  limit 1;

  if v_id is not null then
    raise exception 'Phone already registered';
  end if;

  insert into public.users(phone,pin_hash,active)
  values(p_phone,crypt(p_pin,gen_salt('bf',10)),true)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.register_customer_secure(text,text) from public,anon,authenticated;
grant execute on function public.register_customer_secure(text,text) to service_role;
