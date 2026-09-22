# Commission payments and administrator fallback

Completing a job retains the agreed fare on the order and charges a service fee
of 5%, rounded to the nearest 500 MNT (half steps round upward). For example,
112,820 MNT × 5% = 5,641 MNT → **5,500 MNT**; 115,000 MNT → **6,000 MNT**.
A fee rounded to zero is waived without a bank transfer. Other fees get a unique
six-digit reference and block new work until a matching bank receipt or manual
admin approval. Reloading or using another device restores the same stored fee.
Existing unambiguous unpaid full-fare invoices are converted to this policy;
already paid invoices are unchanged.
Deployment review found two legacy orders with multiple payment rows. These
ambiguous records are excluded from conversion and automatic settlement; no
duplicate is marked as paid or deleted without reconciliation. The paid-history
amount digest remained unchanged after the migration and rollback-only tests.

The admin dashboard has a separate **Эрх нээх** tab for unpaid completed jobs,
including older jobs outside recent history. Search by car plate or driver phone,
including partial numbers. Spaces, hyphens and letter case are ignored. Search
runs over the whole queue before pagination (50 results per page), rather than
only the dashboard's first 200 rows. Clearing the search restores all pending jobs.
Each card shows the driver's name, plate, phone, route, amount and payment reference.
**Зөвшөөрөх · Эрх нээх** approves only that job and keeps the current search.
The visible queue refreshes every ten seconds; it stops when another tab is open.
The main dashboard also refreshes without overwriting bank settings being edited.

Driver polling refreshes every five seconds while the screen is visible. Once
approved, the payment screen closes. Existing eligibility rules still apply:
another unpaid job, an active trip, an incomplete profile or a disabled account
prevents availability. Repeated approval preserves a driver's manual offline state.

Manual approval requires a signed, current administrator session and same-origin POST.
The database rechecks the admin credential version and serializes
order → driver → payment. It records `approved_at` and the admin session version.
Password changes revoke old approval requests. Temporary admin passwords cannot
approve. The RPCs are available only to the server service role, run as the caller,
and grant no customer/driver access to payment or administrator data.

`POST /api/payment/verify` requires a dedicated `x-webhook-secret`, a six-digit
`code`, positive integer `amount`, `currency: "MNT"` and `direction: "credit"`.
`confirm_driver_commission` checks the code and exact stored fee together inside
the same order → driver → payment transaction, rechecks the fee against the fare,
and records `approved_via: "macrodroid"`. Repeated receipts cannot pay a second
job or bring a resting/disabled driver online. Wrong amounts, outgoing transfers,
raw SMS and anonymous calls do not unlock anything. Codes are globally unique
and are never reused. The old `confirm_payment_atomic` remains disabled.

In **Эрх нээх → MacroDroid холболт тохируулах**, current admins can copy the URL
and dedicated key. An existing `PAYMENT_WEBHOOK_SECRET` takes precedence; when
absent, a domain-separated HMAC key is derived from `SESSION_SECRET`. The parent
session secret is never returned. The key is never included in driver responses,
public pages or storage; closing the admin settings clears it from component state.
The phone adapter must be configured separately to accept only the bank sender
and incoming transfers to the configured receiving account. A real bank SMS sample
is still needed to verify its amount/reference extraction. No bank SMS format is
guessed and no real payment is simulated during verification.

Verification: `node --test tests/*.test.cjs`, `npm run lint -- --quiet`,
`npm run build`, and rollback-only `tests/payment-database.sql` and
`tests/admin-payment-search.sql` and `tests/commission-payment-database.sql`.
The database script verifies completion/retry, manual approval, stale admin
sessions, role grants, old payment rejection, the unpaid queue, other blocking
work and disabled drivers. It rolls back every fixture and credential change.
Search verification covers phone formatting, Cyrillic plates, paging through
206 fixtures, wildcard input and finding a matching job after the first 200.
