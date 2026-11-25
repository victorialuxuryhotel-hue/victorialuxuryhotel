#!/usr/bin/env bash
# Browser tests against the running dev server (pnpm dev), its local D1/R2, and the Clerk development instance.
# Starts the Paystack/Resend mock if it isn't already running. Test accounts are kept in tests/e2e/.state (git-ignored).
# Run one file: tests/e2e/run.sh tests/e2e/auth.e2e.mjs
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! curl -sf -o /dev/null http://localhost:3000/login; then
  echo "Start the dev server first: pnpm dev" >&2
  exit 1
fi

node --env-file=.env.local --input-type=module -e '
const key = process.env.CLERK_SECRET_KEY ?? "", pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
if (!key.startsWith("sk_test_") || !pk.startsWith("pk_test_")) { console.error("Browser tests need the Clerk development keys in .env.local"); process.exit(1); }
const host = Buffer.from(pk.split("_")[2], "base64").toString().replace(/\$$/, "");
const a = (await (await fetch(`https://${host}/v1/environment`)).json()).user_settings.attributes;
if (!a.authenticator_app?.enabled || !a.backup_code?.enabled) {
  console.warn("Note: authenticator apps are off in the Clerk development instance. The two-step test is skipped, and the dev server must run with TWO_STEP_OPTIONAL=1 (localhost only) for owner, general manager, hotel manager and finance to sign in.");
}'

if ! curl -sf -o /dev/null http://127.0.0.1:4010/__health; then
  node tests/mocks/integrations-mock.mjs > /tmp/victoria-integrations-mock.log 2>&1 &
  MOCK_PID=$!; trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:4010/__health && break; sleep 0.25; done
fi

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(tests/e2e/twostep.e2e.mjs tests/e2e/auth.e2e.mjs tests/e2e/invite.e2e.mjs tests/e2e/workflows.e2e.mjs tests/e2e/payments.e2e.mjs tests/e2e/photos.e2e.mjs tests/e2e/ops.e2e.mjs)
status=0
for t in "${files[@]}"; do echo "== $t"; node --env-file=.env.local "$t" || status=1; done
exit $status
