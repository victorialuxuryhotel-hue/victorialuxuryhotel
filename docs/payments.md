# Payments and notifications

## Online payment (Paystack)

```
Guest           App server                     Database                       Paystack
  │ Pay ──────────▶ begin_paystack_payment ──────▶ pending payment, our reference
  │                 initialize(amount from DB) ──────────────────────────────────▶
  │ ◀─────────── redirect to Paystack checkout ◀──────────────────────────────────
  │ pays ─────────────────────────────────────────────────────────────────────────▶
  │                 webhook (signed) ◀──────────────────────────────────────────────
  │                 callback (browser) ◀─────────────────────────────────────────── redirect
  │                 verify(reference) ────────────────────────────────────────────▶ the truth
  │                 apply_paystack_result ───────▶ lock payment; check amount + NGN;
  │                                                successful + receipt; confirm booking
  │ ◀── confirmation page / email (sent once, by whichever call confirmed it)
```

- **The browser is never trusted.** The callback and webhook only tell us *which*
  reference to look at; the outcome always comes from Paystack's verify API.
- **Amount and currency must match** what the database calculated. A mismatch
  is recorded and the reservation flagged "needs attention"; nothing is confirmed.
- **Idempotent and race-safe.** `apply_paystack_result` locks the payment row.
  Callback, webhook, retries and the scheduled sweep can all run at once; one
  confirms, the rest return `already_processed`. One confirmation email.
- **Webhooks:** HMAC-SHA512 signature checked against the secret key (401 if
  wrong); events stored once by body hash (Paystack retries are no-ops); card
  details are not stored. Processing errors return 500 so Paystack retries.
- **Delayed or lost webhooks:** the confirmation page verifies with Paystack
  itself, and the scheduled job re-verifies pending attempts (2 min to 48 h old).
- **Paid after the hold lapsed:** confirmed if the room type still has space;
  otherwise the money is recorded and the booking flagged for a refund or rebooking.
- **Failed / abandoned:** recorded; the guest can retry while the hold lasts
  (each attempt gets a fresh reference).

## Offline payments

Staff record cash, bank transfer, POS or other payments from the reservation
(Record payment). The database requires the **"money received" confirmation**,
refuses overpayment, future dates and duplicate references, records who took
the payment, and audits it. Part payments are allowed; the booking confirms when
fully paid. The guest is emailed a receipt.

## Receipts

Every successful payment gets a sequential receipt number (`RCT-YYYY-NNNNNN`),
shown to the guest, emailed, and printable at `/app/payments/receipt/<number>`.

## Emails (Resend)

Booking confirmed (guest + optional hotel copy), payment received (offline),
reservation cancelled. Sent after the database commit; a failed email is logged
and never undoes a payment or booking. Idempotency keys prevent duplicates.

## Scheduled job

`GET /api/cron/expire-reservations` (Bearer `CRON_SECRET`), run every 10
minutes by a Cloudflare Cron Trigger (`wrangler.jsonc` → `worker.ts`): settles
pending Paystack attempts, expires lapsed holds and sends queued emails.
Availability is correct regardless, because expired holds stop counting
immediately.

## Testing locally

`pnpm mock:integrations` runs a local Paystack + Resend stand-in on port 4010
(checkout page with Pay / Decline / Cancel, signed webhooks, controls for lost,
duplicate, forged webhooks and tampered amounts). `.env.local` points
`PAYSTACK_BASE_URL` and `RESEND_BASE_URL` at it. `pnpm test:e2e` starts it if
needed. **A live key (`sk_live_…`) always uses the real Paystack API**, whatever
`PAYSTACK_BASE_URL` says.

## Switching to the hotel's real accounts

1. **Paystack test mode first.** Dashboard → Settings → API Keys & Webhooks:
   - copy the **test secret key** into `PAYSTACK_SECRET_KEY`;
   - remove `PAYSTACK_BASE_URL`;
   - set the test **Webhook URL** to `https://<domain>/api/webhooks/paystack`
     (the callback URL is sent per transaction, no dashboard setting needed).
   - Run a booking with Paystack's test cards (success, and a declined card).
2. **Resend.** Verify the hotel's sending domain (DNS records), create an API key,
   set `RESEND_API_KEY`, `EMAIL_FROM` (an address on that domain) and optionally
   `HOTEL_NOTIFY_EMAIL`; remove `RESEND_BASE_URL`.
3. **Live.** Only after the hotel's Paystack account is approved and step 1 has
   passed: set the **live** secret key and the live webhook URL, then run one
   real low-value transaction end to end and confirm it in the Paystack
   dashboard, the reservation, the receipt and the email.

Refunds are not processed by the app yet: the cancellation policy is still to
be confirmed. Bookings needing a refund are flagged "needs attention"; refunds
are made in the Paystack dashboard or by transfer and noted when the flag is resolved.
