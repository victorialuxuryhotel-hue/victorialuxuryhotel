# Deploying to Cloudflare

The whole app runs on Cloudflare as one **Worker**, built with the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare). Staff sign-in
is **Clerk**; Paystack and Resend are called from the Worker.

## How the pieces fit

| Concern | Where it runs |
| --- | --- |
| Pages, server actions, API routes (webhook, callback, health) | Worker `victorialuxuryhotel` |
| Database | D1 `victoria-hotel-db` (binding `DB`), schema in `migrations/` |
| Hotel photos | R2 bucket `victorialuxuryhotel` (binding `PHOTOS`), served from `/media/…` |
| Static files, prerendered shells | Workers static assets |
| Image resizing (`next/image`) | Cloudflare Images binding |
| Housekeeping every 10 minutes | Cron Trigger (in `wrangler.jsonc`) |
| Staff sign-in, invitations | Clerk application "Victorialluxuryhotel" (`app_3MSHeclH3V96qrLoldTYJuc6kER`) |
| Booking emails | Resend, sending from `victorialuxuryhotel.com` |

Cloudflare account: `victorialuxuryhotel@gmail.com`. Domain registrar: Namecheap.

## Status (22 Nov 2026)

| Step | Status |
| --- | --- |
| D1 migrations 0001–0007 applied to production | Done |
| Starter room types and 29 rooms loaded (`db/starter.sql`) | Done. Edit in the management app |
| Live at **https://victorialuxuryhotel.com** and `www` (also `…workers.dev`) | Done, `/api/health` returns `{"ok":true}` |
| Domain nameservers moved from Namecheap to Cloudflare | Done |
| Resend DNS records in Cloudflare (DNS only) | Done; domain Verified in Resend |
| Custom domains on the Worker, site URL switched | Done |
| Test accounts, one per role (Clerk development instance) | Done: usernames `owner`, `manager`, `frontdesk` (emails `…+clerk_test@victorialuxuryhotel.com`, Clerk test addresses: code `424242`, no inbox needed); passwords in git-ignored `.test-accounts.local`. Replace with real staff on Clerk production |
| First owner account | To do: needs the owner's name and email |
| Resend sending from `bookings@victorialuxuryhotel.com` | To do once Resend shows the domain verified |
| Paystack keys | To do: test keys first, live keys only with the hotel's approval |
| Clerk production instance (removes the "Development mode" badge) | To do once the domain is live |
| Email for @victorialuxuryhotel.com | Cloudflare Email Routing → hotel Gmail (owner@, manager@, frontdesk@, bookings@) until Google Workspace replaces it; keep a single SPF record |

## Deploying

```bash
pnpm db:migrate:remote      # apply any new migrations to production D1
pnpm cf:deploy              # build with OpenNext and deploy
curl https://victorialuxuryhotel.com/api/health
```

### Environment: read this before deploying

OpenNext **compiles every `.env` file into the Worker**, including `.env.local`,
whose values point at local mocks (fake Paystack/Resend servers, `localhost`).
Production overrides live in the git-ignored **`.env.production.local`**, which
takes priority over `.env.local`:

```
NEXT_PUBLIC_SITE_URL=https://victorialuxuryhotel.com
PAYSTACK_BASE_URL=
RESEND_BASE_URL=
ALERT_WEBHOOK_URL=
HOTEL_NOTIFY_EMAIL=
RATE_LIMIT_HOLDS_PER_HOUR=6        # must be set: an empty value means a limit of 0
RATE_LIMIT_PAYMENTS_PER_HOUR=20
EMAIL_FROM="Victoria Luxury Hotel <bookings@victorialuxuryhotel.com>"
```

`NEXT_PUBLIC_*` values are fixed at build time, so changing the site URL means
rebuilding. At runtime, **Worker secrets win** over anything compiled in from
`.env` files. Secrets set on the Worker today: `CRON_SECRET`, `RATE_LIMIT_SALT`.
Production keys (Paystack, Clerk production) should be set as secrets with
`pnpm exec wrangler secret put NAME`, never written into `.env` files.

### Data

- `db/seed.sql` is **local only**: placeholder staff and descriptions.
- `db/starter.sql` is the production starting point (room types, rates, rooms;
  no staff, no descriptions). Already loaded; safe to run again.
- The first owner: `CLERK_SECRET_KEY=… NEXT_PUBLIC_SITE_URL=https://victorialuxuryhotel.com pnpm staff:create-owner --email … --name "…"`.
  Everyone else is invited from Settings → Staff.

## Moving the domain to Cloudflare

Done once; kept here for reference.

1. **Cloudflare → Add a domain** → `victorialuxuryhotel.com` → Free plan. Cloudflare
   imports the existing records and assigns nameservers:
   `lewis.ns.cloudflare.com` and `suzanne.ns.cloudflare.com`.
2. **Namecheap → Domain List → Manage → Domain tab → NAMESERVERS** → change
   "Namecheap BasicDNS" to **Custom DNS**, enter the two Cloudflare nameservers,
   click the green ✓. (Not "Advanced DNS → Personal DNS Server", which is for
   registering your own nameservers.)
3. Keep **DNSSEC off** at Namecheap until Cloudflare is Active.
4. Cloudflare → **Check nameservers now**, wait for **Active** (usually under an
   hour, up to 24).

### DNS records to keep in Cloudflare

Email-related records must be **DNS only (grey cloud)**.

| Type | Name | Content | Purpose |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCUbu7itoqkzJTg3bBWwh42etQ7ia69A5QSZ9JSVok4talRZiO6SCDS9tQ6l7TWuc1P4+7yFXYNa15A041wXHFxbpKlbqAbVwHsZT/uXQ2uD4QgAcmGZhqCEJLOpC9O7zOciv7GWbi/2wItV2lpeapd3/aQpMOz35he0VgH0vDAQIDAQAB` | Resend DKIM (public key) |
| CNAME | `send` | `send.forge.rmta.net` | Resend |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` | Resend |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC |
| MX / TXT (SPF) | `@` | Namecheap `eforward…` / `v=spf1 include:spf.efwd.registrar-servers.com ~all` | Old Namecheap email forwarding: replace with Cloudflare Email Routing if used |

The Namecheap `www → parkingpage.namecheap.com` CNAME and the `@` URL redirect are
replaced when the domain is attached to the Worker.

## Attaching the domain to the Worker

Done. For reference, `wrangler.jsonc` has, set `NEXT_PUBLIC_SITE_URL=https://victorialuxuryhotel.com`
in `.env.production.local`, then `pnpm cf:deploy`:

```jsonc
"routes": [
  { "pattern": "victorialuxuryhotel.com", "custom_domain": true },
  { "pattern": "www.victorialuxuryhotel.com", "custom_domain": true }
]
```

A custom domain can't be created over an existing DNS record of the same name
(error 100117): the old root and `www` records from Namecheap had to be deleted
first. Email CNAMEs (`send`, `rsend`) must stay **DNS only**; proxying them breaks Resend. Cloudflare issues the HTTPS certificate
automatically.

## Checks after each deploy

- `/api/health` returns `{"ok":true}`.
- `/`, `/rooms`, `/book` load; `/app` redirects to `/login`.
- Worker logs show the cron run every 10 minutes.
