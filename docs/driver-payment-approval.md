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

`POST /api/payment/verify` requires a dedicated `x-webhook-secret`. For MacroDroid,
send `Content-Type: text/plain; charset=utf-8`, the actual SMS sender in
`x-sms-sender`, and the complete incoming SMS as the body. Only the observed Khan
Bank format is accepted: `Tany <mask> dansand ORLOGO:<amount>MNT orj
ULDEGDEL:<balance>MNT bolloo.Utga:<six digits>`. Only ORLOGO supplies the payment
amount; the balance is ignored. Fractional incoming amounts, `Utga:t`, extra text,
multiple concatenated messages, failed/outgoing transfers, other currencies,
unrecognized formats, wrong senders/accounts and bodies over 2048 characters fail
closed. Whitespace and letter case variations are accepted; the code is exactly
six ASCII digits. No live payment is simulated using a screenshot.

The authenticated JSON contract remains available for existing trusted bank
adapters: six-digit `code`, positive integer `amount`, `currency: "MNT"` and
`direction: "credit"`. Those adapters must verify the sender and receiving account
themselves. JSON containing `sms`, `message` or `text` cannot override the parser.
`confirm_driver_commission` checks the code and exact stored fee together inside
the same order → driver → payment transaction, rechecks the fee against the fare,
and records `approved_via: "macrodroid"`. Repeated receipts cannot pay a second
job or bring a resting/disabled driver online. Wrong amounts and anonymous calls
do not unlock anything. Codes are globally unique
and are never reused. The old `confirm_payment_atomic` remains disabled.

In **Эрх нээх → MacroDroid холболт тохируулах**, current admins can copy the URL
and dedicated key. An existing `PAYMENT_WEBHOOK_SECRET` takes precedence; when
absent, a domain-separated HMAC key is derived from `SESSION_SECRET`. The parent
session secret is never returned. The key is never included in driver responses,
public pages or storage; closing the admin settings clears it from component state.
Set the receiving bank/account in **Жолооч**, then save the actual sender ID and
the exact masked account (for example `5***2086`) in the MacroDroid connection
panel. The sender cannot be inferred from the contact display name. The mask's
last four digits must match the receiving account, and the first digit must also
match for domestic numeric account numbers. Formatted MN IBANs are accepted for
the transfer account; this check is not an IBAN checksum validation. The full saved
transfer account is bound into the configuration: changing it disables SMS
confirmation until an admin rebinds it. Masked messages cannot distinguish two
accounts with the same visible digits. Never bind such accounts to the same
receiving phone without a bank feed that identifies the full account.

The same-origin, current-admin POST saves the SMS binding; it never accepts a
client-supplied receiving account. The config/key are not returned to drivers.
Driver responses advertise automatic matching only after a valid binding exists;
this does not prove that the physical phone is connected. Configure MacroDroid
to trigger on that bank sender, choose the incoming sender number and full SMS
from its Magic Text menu, and send the POST. The actual sender, transfer account
and on-device setup still require the operator. The phone needs SMS permission,
network access and background operation. SMS filtering and a private device key
are not a cryptographically signed bank API. Confirm one real incoming payment
on the physical phone before relying on automation; manual approval remains
available after reconciling the bank statement.

Verification: `node --test tests/*.test.cjs`, `npm run lint -- --quiet`,
`npm run build`, and rollback-only `tests/payment-database.sql` and
`tests/admin-payment-search.sql` and `tests/commission-payment-database.sql`.
The database script verifies completion/retry, manual approval, stale admin
sessions, role grants, old payment rejection, the unpaid queue, other blocking
work and disabled drivers. It rolls back every fixture and credential change.
Search verification covers phone formatting, Cyrillic plates, paging through
206 fixtures, wildcard input and finding a matching job after the first 200.
