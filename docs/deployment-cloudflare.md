# Deploying to Cloudflare

The app runs as a **Cloudflare Worker**, built with the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare). The database,
auth and photo storage stay on **Supabase**; Paystack and Resend are called from
the Worker.

> Use **Workers** (Workers & Pages → Create → Worker → Import a repository),
> not a static Pages project. A plain `next build` on Pages cannot run server
> actions, payment webhooks or the scheduled job.

## How the pieces fit

| Concern | Where it runs |
| --- | --- |
| Pages, server actions, API routes (webhook, callback, health) | The Worker (`worker.ts` → `.open-next/worker.js`) |
| Static files (JS, CSS, fonts, logo) | Workers static assets |
| Prerendered page shells | Read-only cache in the Worker's static assets (no R2 or D1 needed) |
| Image resizing (`next/image`) | Cloudflare Images binding |
| Housekeeping every 10 minutes | Cron Trigger → `/api/cron/expire-reservations` (in `wrangler.jsonc`) |
| Data, auth, photos | Supabase (production project) |

## 1. Supabase production project

1. Create a project at supabase.com (region close to Nigeria, e.g. EU West).
2. Apply the schema from this repo:
   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push        # applies supabase/migrations in order
   ```
   Do **not** run `seed.sql` or `demo.sql` in production.
3. Authentication → Providers / Settings:
   - **Disable sign-ups** (staff are invited by the owner).
   - Minimum password length **10**.
   - Site URL: `https://<your-domain>`; Redirect URLs: `https://<your-domain>/auth/confirm`.
   - SMTP: use Resend's SMTP so invite and password emails come from the hotel.
4. Authentication → Email templates: copy `supabase/templates/invite.html` and
   `supabase/templates/recovery.html` (they link to `/auth/confirm`).
5. Create the first owner (sends an invitation email):
   ```bash
   node --env-file=.env.production.local scripts/create-staff.mts \
     --email owner@hotel.com --name "Full Name" --role owner
   ```

## 2. Cloudflare resources

None to create by hand. The Worker, its static assets, the Images binding and
the Cron Trigger are all created by the first deploy from `wrangler.jsonc`.
R2 does not need to be enabled on the account (see "Caching" below).

## 3. Connect the repository (Workers Builds)

Workers & Pages → Create → **Worker** → Import repository → this repo, branch `main`.

| Setting | Value |
| --- | --- |
| Build command | `pnpm opennextjs-cloudflare build` |
| Deploy command | `pnpm opennextjs-cloudflare deploy` |
| Root directory | `/` |

**Build variables** (needed at build time; `NEXT_PUBLIC_*` are compiled into the site):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API keys → Publishable key |

**Runtime variables and secrets** (Worker → Settings → Variables and Secrets; mark keys as *Secret*):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same values as the build variables |
| `SUPABASE_SECRET_KEY` | Secret. Supabase → API keys → Secret key |
| `PAYSTACK_SECRET_KEY` | Secret. `sk_test_…` until the live account is approved |
| `RESEND_API_KEY` | Secret |
| `EMAIL_FROM` | e.g. `Victoria Luxury Hotel <bookings@hotel-domain>` (verified in Resend) |
| `CRON_SECRET` | Secret. 32+ random characters (`openssl rand -hex 24`) |
| `RATE_LIMIT_SALT` | Secret. Random; used to hash visitor IPs |
| `HOTEL_NOTIFY_EMAIL` | Optional: hotel inbox for new-booking copies |
| `ALERT_WEBHOOK_URL` | Optional: Slack/Discord incoming webhook for alerts |

Never set `PAYSTACK_BASE_URL` or `RESEND_BASE_URL` in production (they exist
only for the local mock). A live Paystack key ignores the override anyway.

## 4. Domain

Worker → Settings → Domains & Routes → **Add custom domain** (the domain's DNS
must be on Cloudflare). Update `NEXT_PUBLIC_SITE_URL` and Supabase's Site URL /
Redirect URL if the domain changes.

## 5. Paystack

Paystack dashboard → Settings → API Keys & Webhooks:
- **Webhook URL:** `https://<your-domain>/api/webhooks/paystack`
- Test mode first: book with Paystack's test cards (success, then a declined
  card), and check the booking, receipt and email.
- Live: only after the account is approved and test mode has passed. Switch the
  secret key and set the live webhook URL, then run one real low-value booking
  end to end.

## 6. Check the deployment

- `https://<your-domain>/api/health` → `{"ok":true}` (point an uptime monitor at it).
- Sign in as the owner, invite a staff member, upload a photo, make a test booking.
- Worker → Logs: `cron.run` entries every 10 minutes.

## Local preview of the Cloudflare build

```bash
pnpm db:start && pnpm db:fresh      # local Supabase with demo data
pnpm mock:integrations              # local Paystack/Resend stand-in
pnpm cf:preview                     # builds, then serves the Worker on :3000 (workerd)
pnpm test:e2e                       # full browser suite against the preview
```

`pnpm dev` remains the fast inner loop; run `pnpm cf:preview` + `pnpm test:e2e`
before deploying.

## Cloudflare-specific notes

- **Nothing that holds I/O is shared between requests.** Workers reject a
  promise created by one request and awaited by another, so the Supabase admin
  client is created per use (`src/lib/supabase/admin.ts`).
- **Server actions call `refresh()`, not `revalidatePath()`.** Management pages
  are dynamic; revalidating a path made the Worker regenerate it in a way that
  failed on later requests.
- **Public pages read room types and photos per request** (not Next's data
  cache), so staff changes show on the next page view and no cache
  regeneration is needed.
- **Caching.** The only cached output is what `next build` prerenders, served
  read-only from static assets (`open-next.config.ts`). This works because the
  app uses no `"use cache"`, `revalidatePath`/`revalidateTag` or ISR.

### If caching is added later

If any of those are introduced, a read-only cache will silently serve stale
pages. Switch to a writable cache first:

1. Enable R2 on the account, then create the storage:
   ```bash
   pnpm exec wrangler r2 bucket create victoria-hotel-opennext-cache
   pnpm exec wrangler d1 create victoria-hotel-tag-cache   # copy the database_id
   ```
2. In `open-next.config.ts`, use `r2IncrementalCache`, `d1NextTagCache` and
   `memoryQueue` (from `@opennextjs/cloudflare/overrides/...`).
3. Add the `r2_buckets` (`NEXT_INC_CACHE_R2_BUCKET`) and `d1_databases`
   (`NEXT_TAG_CACHE_D1`) bindings to `wrangler.jsonc`.
- **The session proxy (`src/proxy.ts`) uses OpenNext's Node middleware support,
  which OpenNext marks experimental.** Sign-in, session refresh and role access
  are covered by the browser tests run against the Cloudflare preview.
- Logs may show `TypeError: Unable to enqueue` on sign-in requests. Sign-in
  works; it appears when the browser drops a response stream after the redirect.
