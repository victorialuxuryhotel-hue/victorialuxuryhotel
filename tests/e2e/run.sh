#!/usr/bin/env bash
# Browser tests against the running dev server (pnpm dev) and its local D1/R2.
# Staff sign in the way they do at the hotel: by name and PIN on a station. as(role) makes its own test staff and
# stations in the local database (kept in tests/e2e/.state, git-ignored). Only the tests about Clerk itself
# (twostep, auth, invite) use the Clerk development instance.
# Starts the Paystack/Resend mock if it isn't already running.
# Run one file: tests/e2e/run.sh tests/e2e/stationSignIn.e2e.mjs
# Another server: E2E_BASE=http://localhost:3201 tests/e2e/run.sh ... (start that server with
# NEXT_PUBLIC_SITE_URL=http://localhost:3201 so the Paystack mock sends the guest back to it).
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE="${E2E_BASE:-http://localhost:3000}"
export E2E_BASE="$BASE"

if ! curl -sf -o /dev/null "$BASE/login"; then
  echo "Start the dev server first: pnpm dev (expected at $BASE)" >&2
  exit 1
fi

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(tests/e2e/stationSignIn.e2e.mjs tests/e2e/twostep.e2e.mjs tests/e2e/auth.e2e.mjs tests/e2e/invite.e2e.mjs tests/e2e/workflows.e2e.mjs tests/e2e/payments.e2e.mjs tests/e2e/changes.e2e.mjs tests/e2e/approvals.e2e.mjs tests/e2e/till.e2e.mjs tests/e2e/hall.e2e.mjs tests/e2e/photos.e2e.mjs tests/e2e/ops.e2e.mjs)

# The Clerk development keys are only needed for the tests about Clerk.
if printf '%s\n' "${files[@]}" | grep -qE '(twostep|auth|invite)\.e2e\.mjs$'; then
  node --env-file=.env.local --input-type=module -e '
const key = process.env.CLERK_SECRET_KEY ?? "", pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
if (!key.startsWith("sk_test_") || !pk.startsWith("pk_test_")) { console.error("The Clerk tests (twostep, auth, invite) need the Clerk development keys in .env.local"); process.exit(1); }
const host = Buffer.from(pk.split("_")[2], "base64").toString().replace(/\$$/, "");
const a = (await (await fetch(`https://${host}/v1/environment`)).json()).user_settings.attributes;
if (!a.authenticator_app?.enabled || !a.backup_code?.enabled) {
  if (process.env.TWO_STEP_ENFORCED === "1") console.warn("Note: TWO_STEP_ENFORCED=1 but authenticator apps are off in the Clerk development instance. Turn them on, or run the dev server with TWO_STEP_OPTIONAL=1 (localhost only).");
}'
fi

if ! curl -sf -o /dev/null http://127.0.0.1:4010/__health; then
  APP_WEBHOOK_URL="$BASE/api/webhooks/paystack" node tests/mocks/integrations-mock.mjs > /tmp/victoria-integrations-mock.log 2>&1 &
  MOCK_PID=$!; trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:4010/__health && break; sleep 0.25; done
fi

status=0
for t in "${files[@]}"; do echo "== $t"; node --env-file=.env.local "$t" || status=1; done
exit $status
