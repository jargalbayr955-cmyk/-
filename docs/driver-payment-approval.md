# Manual approval after a driver completes a job

Completing a job retains its agreed price and payment code, makes the driver
unavailable, and opens the payment screen. New work stays blocked until an
administrator approves the specific job. Reloading or using another device
restores the same pending payment from the database.

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

Approval requires a signed, current administrator session and same-origin POST.
The database rechecks the admin credential version and serializes
order → driver → payment. It records `approved_at` and the admin session version.
Password changes revoke old approval requests. Temporary admin passwords cannot
approve. The RPCs are available only to the server service role, run as the caller,
and grant no customer/driver access to payment or administrator data.

Automatic payment verification cannot unlock drivers: the bank webhook returns
`409 ADMIN_APPROVAL_REQUIRED` for a matching unpaid receipt. The former
`confirm_payment_atomic` RPC is disabled, including for older deployments.
Previously approved payments and payment amounts are unchanged.

Verification: `node --test tests/*.test.cjs`, `npm run lint -- --quiet`,
`npm run build`, and rollback-only `tests/payment-database.sql` and
`tests/admin-payment-search.sql`.
The database script verifies completion/retry, manual approval, stale admin
sessions, role grants, old payment rejection, the unpaid queue, other blocking
work and disabled drivers. It rolls back every fixture and credential change.
Search verification covers phone formatting, Cyrillic plates, paging through
206 fixtures, wildcard input and finding a matching job after the first 200.
