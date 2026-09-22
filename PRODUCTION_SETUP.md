# Achilt Production V5.5 setup

V5.5 keeps the agreed dispatch flow and removes OTP/paid map dependencies.

## 1) Marketplace flow

1. Customer signs in with an 8-digit Mongolian phone number and a 4-8 digit PIN.
2. Customer selects the pickup point on the map. The marker can be dragged or moved by tapping the map.
3. The nearest 8 online, matching drivers with fresh GPS are invited once.
4. Those 8 drivers have a fixed 10-minute window to send a price. Drivers are not rotated or replaced during that window.
5. Customer sees only drivers who actually submitted a price, including price, approximate straight-line distance and location.
6. Once the customer selects one quote, the order and driver are atomically locked and every other offer closes.
7. If 10 minutes expire without a selection, the customer can start a fresh search.

## 2) Database migrations

V4, V5.2 and V5.3 must already be applied. Then apply:

`supabase/migrations/20260919_v5_5_pin_auth.sql`

The V5.5 migration prevents an existing phone number from being silently claimed by assigning it a new PIN. It does not delete users, drivers, orders or payment history.

## 3) Vercel environment variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET` (32+ random characters)
- `ADMIN_PASSWORD` (strong unique password)

Feature-dependent:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `PAYMENT_WEBHOOK_SECRET`

No `NEXT_PUBLIC_MAPBOX_TOKEN`, Google Maps key, or customer OTP environment variable is required.

Never put service-role, admin, session, webhook or private VAPID secrets in `NEXT_PUBLIC_*`.

## 4) Customer authentication

Customer login is intentionally phone + PIN only. OTP request/verify API routes return HTTP 410 so an old UI or stale client cannot accidentally re-enable SMS auth.

Registration accepts only a new phone number. Existing phone numbers are never assigned a new PIN through registration. If an old account has no PIN, handle it through an explicit account recovery/admin process rather than silently claiming the number.

PINs are stored as bcrypt hashes through PostgreSQL `pgcrypto`; plaintext PINs are not stored by the V5 secure functions.

## 5) Free maps

The app uses MapLibre GL JS and the OpenFreeMap public vector-map style:

`https://tiles.openfreemap.org/styles/liberty`

No API key or billing account is required. Attribution remains visible on the map. OpenFreeMap is a free public service without an SLA, so the map provider is isolated in `lib/client/free-map.ts` and can be switched later without rewriting the order flow.

Current-location pickup and remote pickup both use an explicit map marker. Remote pickup never silently falls back to the customer's current GPS.

## 6) Admin and driver rules

- Only admin can create, disable/remove, re-enable or reset a driver PIN.
- New drivers receive a random 6-digit temporary PIN.
- Driver login accepts 4-8 digit legacy/current PINs, so the admin-generated 6-digit PIN works.
- Driver profile PIN changes use a 6-digit PIN.
- PINs are stored hashed, not plaintext.
- Removing a driver is a soft-delete so old trip/payment history remains.
- Disabled/removed drivers cannot authenticate or enter nearest-8 dispatch.
- Driver profile/location/availability updates go through authenticated server APIs.

## 7) Pre-launch test

Use at least 9 test drivers on separate devices/contexts.

1. Register a new customer with phone + PIN, log out, then log in again with the same PIN.
2. Confirm an already-registered phone cannot be registered again with a different PIN.
3. Confirm no SMS/OTP screen appears and OTP API calls return 410.
4. Open current-location pickup; confirm the free map fills the map area, GPS centers correctly and the pickup marker is draggable.
5. Open remote pickup; confirm the pickup marker can be placed far from the customer's current GPS and that exact coordinates are sent with the order.
6. Put 9 matching drivers online with fresh GPS; confirm only the nearest 8 are invited.
7. Let some drivers quote and others stay silent; confirm there is no driver rotation before the 10-minute deadline.
8. After 10 minutes, confirm a new quote is rejected and the customer can start a fresh search.
9. Try selecting the same driver from two customer orders at the same time; only one selection may succeed.
10. Complete the trip; confirm payment amount equals the selected offer and the driver stays unavailable until payment confirmation.
11. Disable a driver in admin and confirm an existing session loses access on its next authenticated API call.
12. Test push notifications, browser sound/vibration where supported, and the payment webhook.

## 8) Verification

Run `npm ci`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` with the Vercel Preview environment configured. MapLibre 5.24.0 is bundled locally and its CSS is imported by the root layout; no external JavaScript CDN or map token is needed.

The connected `achilt` database already has `20260920175500_v5_5_pin_auth` and `20260920175800_v5_5_db_hardening` applied. The included PIN migration is a source copy; do not reapply it as a new migration to that project.

Promote only after reviewing the Preview verification results. Device GPS, push delivery, sound/vibration and bank webhook delivery still need their actual devices/providers.

## 9) Payment webhook contract (launch-audit branch; deploy with the sender)

Automatic confirmation is disabled when `PAYMENT_WEBHOOK_SECRET` is absent. Until the bank adapter is configured and verified, the driver UI directs the driver to the administrator for confirmation after the administrator checks the bank receipt.

The trusted bank adapter must validate an actual incoming transfer to the configured receiving account before calling `POST /api/payment/verify`. Send the secret only in `x-webhook-secret`, and use `Content-Type: application/json`:

```json
{
  "code": "123456",
  "amount": 12500,
  "currency": "MNT",
  "direction": "credit"
}
```

This is an example, not a real payment. `code` is the exact six-digit payment reference. `amount` is a positive integer in MNT and must equal the amount stored for that payment. An already confirmed code returns success without releasing the driver again. Do not send a balance, outgoing transfer, guessed amount or unverified user message. The endpoint deliberately rejects the old raw `sms`/`message`/`text` payload: there is no verified bank SMS format available in this repository. Update and test any MacroDroid/bank adapter before enabling this endpoint. Never place the webhook secret in a browser or a `NEXT_PUBLIC_*` variable.

The HTTP completion guard prevents retries of already completed trips from generating another payment. Apply the accompanying payment-locking migration before deploying this branch. It serializes completion and confirmation and guards online availability. Run `tests/payment-database.sql` through an authorized database connection; fixtures roll back.

## 10) Driver devices and notification support

The launch-audit branch restores pending payment from the server, maintains fresh foreground GPS on stationary devices, and requires a vehicle type before a driver goes online. Drivers should keep the page open while accepting work. Background GPS is subject to the mobile browser/OS and is not guaranteed.

Push subscriptions accept HTTPS endpoints for FCM, Mozilla, Apple and Windows push services only. New providers require an explicit allow-list review in `lib/server/push-subscription.ts`. A successful provider response is not proof that an actual phone displayed or sounded the notification. Failed deliveries remain unmarked, but a durable automatic retry queue is not implemented; the existing authenticated push-send endpoint can retry while the invitation is active, and foreground order polling remains a fallback.

Regression tests: `node --test tests/*.test.cjs`. These isolate database/push I/O; they do not replace live PostgreSQL transactions or actual bank/device testing.

