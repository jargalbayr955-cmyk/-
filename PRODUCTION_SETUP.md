# Achilt Production V4 setup

## IMPORTANT
This V4 matches the agreed marketplace flow:

- Customer creates an order.
- The nearest 5 available matching drivers are shown on the map immediately.
- All 5 may send a price at the same time.
- A driver that sends a price stays in the active five.
- After 60 seconds, a driver that did not send a price expires and is replaced by the next-nearest driver.
- Once the customer selects one offer, the order is locked, all other offers/invites close, and no new quote is accepted.
- Only after selection does the customer proceed to live tracking/contact.

## 1. Supabase SQL
Open Supabase -> SQL Editor -> New query.

Run ONLY this V4 migration:

`supabase/migrations/20260910_full_production_v4.sql`

It includes duplicate cleanup for old offers/payment codes before creating unique indexes. It does not delete orders or drivers.

Expected successful result: `Success. No rows returned` (or similar).

If an error appears, stop and copy/screenshot the full error before rerunning.

## 2. Vercel environment variables
Keep/configure the values already used by the project, including:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `NEXT_PUBLIC_MAPBOX_TOKEN` (recommended for better map tiles/routes)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` if push notifications are enabled

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, or `VAPID_PRIVATE_KEY` in `NEXT_PUBLIC_*` variables.

## 3. What changed in V4

- `driver_invites` stores the current nearest-five driver slots.
- `refresh_order_driver_slots()` rotates only non-offering drivers after 60 seconds.
- Driver feed now comes from `/api/driver/orders` and only returns orders that driver is invited to quote.
- `/api/driver/offer` refuses quotes from drivers outside the current five or after their slot expired.
- `/api/order/slots` returns at most five map slots and refreshes rotation safely on the server.
- Customer `/drivers` page shows all five trucks on a live map; quoted trucks display price + km.
- Customer can sort arrived offers by nearest or cheapest.
- Selecting a driver is atomic in PostgreSQL and immediately blocks every other quote.
- Selected driver is reserved (`available=false`) until payment is confirmed.
- Push notifications are sent only to newly invited drivers, not every available driver.

## 4. Test before production

Test with at least 6 driver accounts that have GPS coordinates and are `available=true`:

1. Create one customer order.
2. Confirm exactly the nearest 5 appear.
3. Let 2 drivers quote; confirm price + distance appears immediately.
4. Let the other 3 wait past 60 seconds; confirm they rotate out and new nearest drivers rotate in while the 2 quoting drivers stay.
5. Choose one quoted driver.
6. Confirm all other quote buttons stop working and the chosen driver/customer enter tracking/contact.
7. Complete/payment-confirm the order and confirm the driver becomes available again.

Only deploy to the main public Vercel domain after these tests pass.
