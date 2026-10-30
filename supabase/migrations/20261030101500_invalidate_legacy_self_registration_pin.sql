-- The old direct self-registration flow assigned 000000 to every completed driver.
-- Keep the separate admin-created "Шинэ жолооч" onboarding flow intact: those accounts
-- are deliberately forced through the existing first-login PIN change gate.
update public.drivers
set pin=null,
    pin_hash=extensions.crypt(pg_catalog.gen_random_uuid()::text,extensions.gen_salt('bf',10))
where deleted_at is null
  and active=true
  and coalesce(pg_catalog.btrim(name),'') <> 'Шинэ жолооч'
  and pin_hash is not null
  and pin_hash = extensions.crypt('000000', pin_hash);
