# Operations: running and maintaining the hotel system

For whoever maintains the system. The hotel's day-to-day use is in the staff guide and on each
screen's "?"; this page is the technical side: environments, deploys, monitoring, backups,
incidents, secrets.

## 1. What runs where

| | Production | Staging | Local |
|---|---|---|---|
| Address | victorialuxuryhotel.com | staging.victorialuxuryhotel.com | localhost:3000 |
| Worker | `victorialuxuryhotel` | `victorialuxuryhotel-staging` | `pnpm dev` |
| Database (D1) | `victoria-hotel-db` | `victoria-hotel-db-staging` | `~/.cache/victoria-hotel/wrangler` |
| Photos (R2) | `victorialuxuryhotel` | `victorialuxuryhotel-staging` | local R2 |
| Sign-in (Clerk) | Production instance (`pk_live`) | Development instance (`pk_test`) | Development instance |
| Payments (Paystack) | Live key | Test key | Mock (`tests/mocks`) |
| Email (Resend) | Live key | Disabled (placeholder key) | Mock |
| Scheduled job | Every 10 min | Every 10 min | Call `/api/cron/expire-reservations` by hand |

Accounts the hotel should own (with the maintainer added as a member, 2FA on): Cloudflare, Clerk,
Paystack, Resend, GitHub, the domain registrar.

## 2. Routine

**Daily, General Manager (about 10 minutes):** Dashboard → *Anything wrong?* and *Needs attention*;
Payments → *To confirm* against the bank statement and the card terminal's report; sign off closings.

**Weekly, maintainer (15 minutes):**
- GitHub → Actions: last *Backup* run green (a drill runs on the first Monday of the month).
- Review and merge Dependabot pull requests whose CI is green (security fixes first).
- Cloudflare → Workers → `victorialuxuryhotel` → Logs: scan for `level: error`.

**Monthly:** access review (Staff & access; Cloudflare/Clerk/Paystack/Resend/GitHub members); the restore
drill result; costs and usage (all well inside free tiers at this size, apart from Paystack fees).

**Quarterly:** rotate secrets (section 7); upgrade Next.js / OpenNext / wrangler on staging first;
review the compatibility date in `wrangler.jsonc`.

## 3. Monitoring and alerts

| What | How | Where it goes |
|---|---|---|
| Site down | External uptime check on `https://victorialuxuryhotel.com/api/health` every 1–5 min | SMS/email to maintainer and GM |
| Scheduled job stopped or failing | Heartbeat: the Worker pings `HEARTBEAT_URL` after every run (`/fail` on errors) | The heartbeat service alerts after a missed ping (set the period to 10 min, grace 20 min) |
| Problems in the hotel's data | Self-check (`src/server/domain/self-check.ts`, rules §4): urgent checks every 10 min, daily ones after 06:00, each problem at most once a day | `ALERT_WEBHOOK_URL` (Slack, Discord or a Telegram bot URL with `chat_id`), and Dashboard → *Anything wrong?* |
| Payment mismatches, payments not found, job failures | `alert()` in the code | `ALERT_WEBHOOK_URL` |
| Errors in the Worker | Workers Logs (`observability: true`) | Cloudflare dashboard; add Notifications → *Workers error rate* |

Every alert is also written to the Worker's logs as `alert.<event>`, so nothing is lost if the webhook is down.

## 4. Deploying

**Normal path (GitHub):** merge a pull request into `main` → CI runs → *Deploy* deploys **staging**
(migrate, deploy, smoke test) → a person approves **production** in GitHub → production: database
restore point (if there are migrations), migrate, upload, deploy, smoke test, automatic Worker
rollback if the smoke test fails. The run's summary records the restore point and both version IDs.

Rules:
- **Migrations are append-only** (`migrations/migrations.lock.json`, checked in CI) and **backward
  compatible**: add columns/tables in one release, remove or tighten in a later one. The previous
  Worker version must keep working on the migrated database, or rollback isn't safe.
- Deploy mid-morning, after the 06:00 business-day cut-off and before the evening rush. Not during a
  Cloudflare incident (cloudflarestatus.com).
- Write each migration up in `docs/release-review.md` (what it changes, effect on existing rows).

**Manual path (if GitHub is unavailable):**
```
pnpm check && pnpm test:db
pnpm cf:build                                   # with .env.production.local; must say "No secrets in the build output"
npx wrangler d1 time-travel info victoria-hotel-db   # note the bookmark
npx wrangler d1 migrations apply victoria-hotel-db --remote
npx opennextjs-cloudflare upload                # note the Version ID
npx wrangler versions deploy <version>@100% --yes
node scripts/smoke.mjs https://victorialuxuryhotel.com live
```
`.open-next/` holds whichever build ran last: rebuild before deploying to a different environment.

## 5. Rolling back

- **Code:** `npx wrangler deployments list`, then `npx wrangler versions deploy <previous version>@100% --yes`. Takes seconds.
- **Database (last 30 days):** `npx wrangler d1 time-travel restore victoria-hotel-db --bookmark=<bookmark>`
  (bookmarks are in the deploy summary and `docs/release-review.md`). This discards everything written
  since the bookmark, including real bookings and payments: export first, and re-enter anything taken since.
- **Database (older, or Cloudflare unavailable):** restore the latest weekly backup (section 6).

## 6. Backups

- **Time Travel:** Cloudflare keeps point-in-time restore for D1 (30 days on the paid Workers plan, 7 on free).
- **Weekly export (outside Cloudflare):** GitHub → Actions → *Backup*, Mondays 04:00 Lagos. Encrypted with
  `BACKUP_PASSPHRASE` (AES-256), kept 90 days as a workflow artifact. **The hotel owner keeps a copy of the
  passphrase**: without it the backups can't be opened.
- **Restore drill:** first Monday of each month, or *Run workflow* with *drill* ticked. Imports the backup
  into a throwaway database and compares row counts with live.
- **Restore by hand:**
  ```
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in victoria-db-<date>.sql.gz.enc | gunzip > backup.sql
  npx wrangler d1 create victoria-hotel-db-restore
  npx wrangler d1 execute victoria-hotel-db-restore --remote --file backup.sql
  ```
  then point the Worker's `DB` binding at it (or copy rows back), deploy, and check.
- **Photos (R2):** not exported automatically. Keep the original photo files in the hotel's shared drive;
  they can be uploaded again from Rooms → Website photos and each room type's page.

## 7. Secrets and access

| Secret | Lives in | Rotate |
|---|---|---|
| `CLERK_SECRET_KEY` | Cloudflare Worker secret | Clerk → Production → API keys: add new, `wrangler secret put`, then delete the old |
| `RESEND_API_KEY` | Worker secret | Resend → API Keys (sending access only) |
| `PAYSTACK_SECRET_KEY` | Worker secret | Paystack → Settings → API Keys (roll the key) |
| `CRON_SECRET`, `VIEW_AS_SECRET`, `RATE_LIMIT_SALT` | Worker secrets | Generate a random value (`openssl rand -base64 32`) |
| `ALERT_WEBHOOK_URL`, `HEARTBEAT_URL` | Worker secrets | Recreate in Slack/Telegram / the heartbeat service |
| `CLOUDFLARE_API_TOKEN` | GitHub environment secret | Cloudflare → My Profile → API Tokens (scoped to this account: Workers Scripts, D1, R2 edit) |
| `BACKUP_PASSPHRASE` | GitHub secret + the owner's password manager | Only with care: old backups need the old passphrase |

- Never put a key on a command line, in a file in the repo, or in chat. `wrangler secret put NAME` asks for the value.
- The build strips secrets and fails if any remain (`scripts/strip-build-secrets.mjs`); CI scans history with gitleaks.
- When someone leaves: remove them in Staff & access the same day, from every account in section 1, and rotate any
  secret they could have seen.

## 8. Incidents

1. **Is it us?** Uptime alert or a report → open the site; check cloudflarestatus.com, Clerk and Paystack status pages.
2. **Tell the hotel** (GM on WhatsApp): what's affected, and to use the paper procedures
   (`docs/restaurant-bar-offline.md`, rules §6 downtime plan) until it's fixed.
3. **Stop the bleeding:** if it started with a deploy, roll the Worker back (section 5). Only restore the database
   if data is wrong, after exporting what's there.
4. **Fix forward** through the normal deploy path (staging first).
5. **Afterwards:** a short note in `docs/incidents/` (what happened, impact, cause, what changes), and enter any
   paper sales or bookings taken during the outage.

## 9. One-time setup still to do

- [ ] Uptime monitor on `/api/health` (UptimeRobot or Better Stack), alerting the maintainer and the GM.
- [ ] Heartbeat check (Healthchecks.io or Better Stack): period 10 min, grace 20 min; `npx wrangler secret put HEARTBEAT_URL`.
- [ ] Alert channel: `npx wrangler secret put ALERT_WEBHOOK_URL` (Slack/Discord webhook, or `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`).
- [ ] GitHub: environments *staging*, *production* (required reviewer: you) and *backup*, with the secrets and variables
      listed at the top of `.github/workflows/deploy.yml` and `backup.yml`; branch protection on `main` requiring *CI*.
- [ ] Cloudflare: API token for GitHub (above); Notifications → Workers error rate; consider the paid Workers plan
      ($5/month) for 30-day Time Travel and longer logs.
- [ ] `BACKUP_PASSPHRASE`: generate, store in GitHub and give a copy to the owner.
- [ ] Staging: a Paystack **test** key if the one in use doesn't work against Paystack's API.
