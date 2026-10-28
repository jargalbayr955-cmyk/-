update public.users
set otp_registered_at = null
where created_at < timestamp '2026-10-28 15:44:04.830544';

update public.users
set otp_registered_at = created_at at time zone 'UTC'
where created_at >= timestamp '2026-10-28 15:44:04.830544';
