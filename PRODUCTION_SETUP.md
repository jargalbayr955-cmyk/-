# Achilt Production V5 setup

V5 hardens the app for production while keeping the agreed marketplace flow:

1. A customer creates a request from the pickup location.
2. The nearest 5 online, matching drivers with fresh GPS are shown.
3. All 5 can quote at the same time.
4. A driver who quotes stays in the 5; a driver who does not quote within 60 seconds expires and is replaced by the next-nearest eligible driver.
5. Once the customer selects one quote, the order and driver are atomically locked. All other offers/invites close and no more quotes can be accepted.
6. Only the selected customer/driver continue to contact, live tracking, completion and payment.

## 1) Database migration

V4 has already been applied. In Supabase SQL Editor run:

`supabase/migrations/20260911_full_production_v5_2.sql`

Do not run the `.bak` file. If SQL returns an error, stop and capture the full error before rerunning.

V5 adds:
- PostGIS nearest-driver lookup with a GiST location index.
- 2-minute GPS freshness requirement for dispatch.
- hashed driver/customer PIN support (legacy PINs are migrated away from plaintext).
- durable database-backed API rate limiting.
- server-only RLS access to sensitive tables.
- atomic driver offer submission and atomic customer driver selection.
- a driver-row lock that prevents two customers from selecting the same driver at once.
- soft-delete/disable for drivers so historical orders remain intact.

## 2) Vercel environment variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET` (32+ random characters)
- `ADMIN_PASSWORD` (strong unique password)
- `NEXT_PUBLIC_CUSTOMER_AUTH_MODE=otp`
- `CRON_SECRET`

Recommended/feature-dependent:
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `PAYMENT_WEBHOOK_SECRET`

Never put service-role, admin, session, webhook, cron or private VAPID secrets into a `NEXT_PUBLIC_*` variable.

## 3) Customer SMS OTP

Production should use `NEXT_PUBLIC_CUSTOMER_AUTH_MODE=otp`.
Configure Supabase Auth phone/SMS provider before enabling public traffic. The app uses Supabase Auth only to verify the phone OTP, then links it to the local customer record and issues a server HttpOnly app session.

`pin` mode remains only as an emergency/internal fallback. Do not use PIN mode for a public launch.

## 4) 60-second slot rotation

`vercel.json` requests `/api/cron/refresh-slots` once per minute. Configure `CRON_SECRET` in Vercel. Customer polling also refreshes slots, so an open customer screen keeps rotation moving even if the scheduled job is delayed.

After deployment, verify the cron is actually executing on the selected Vercel plan. If the plan does not support the requested frequency, use a scheduler that can call the same protected endpoint once per minute.

## 5) Admin and driver rules

- Only admin can create, disable/remove, re-enable, or reset a driver PIN.
- New drivers receive a random 6-digit temporary PIN; there is no default `0000`.
- PINs are stored hashed, not plaintext.
- Removing a driver is a soft-delete: old trips and financial history remain.
- Disabled/removed drivers cannot authenticate or enter nearest-five dispatch.
- Driver profile/location/availability updates go through authenticated server APIs only.

## 6) Pre-launch test

Use at least 7 test drivers on separate devices/contexts.

1. Confirm all have fresh GPS and are online.
2. Create one customer order and confirm exactly 5 nearest eligible drivers appear.
3. Let 2 quote and leave 3 silent.
4. After 60–90 seconds confirm the silent 3 rotate out and new nearby drivers rotate in; the 2 quoting drivers stay.
5. Try choosing the same driver from two simultaneous customer orders. Only one selection may succeed.
6. After a customer selects a driver, confirm every other driver can no longer quote that order.
7. Complete the trip; confirm amount equals the selected offer, not the driver's editable profile price.
8. Confirm the driver stays unavailable until payment confirmation and becomes available after confirmation.
9. Disable a driver from admin and confirm an existing session loses access on its next API call.
10. Test customer OTP, driver PIN reset, push notifications, map route/ETA and payment webhook.

## 7) Checks already run on this source

- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- A full `next build` could not run in the isolated build container because the platform-specific Next.js SWC binary was unavailable there. Vercel should run the authoritative production build after push.

No software can be guaranteed to be permanently error-free. Do not call the public launch complete until the database migration, Vercel environment values, scheduled rotation and multi-device end-to-end tests above all pass.
