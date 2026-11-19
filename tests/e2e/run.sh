#!/usr/bin/env bash
# Browser tests against the running dev server (pnpm dev) and local Supabase.
# Starts the Paystack/Resend mock if it isn't already running.
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! curl -sf -o /dev/null http://127.0.0.1:4010/__health; then
  node tests/mocks/integrations-mock.mjs > /tmp/victoria-integrations-mock.log 2>&1 &
  MOCK_PID=$!; trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:4010/__health && break; sleep 0.25; done
fi
node --env-file=.env.local --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await a.auth.admin.createUser({ email: "notstaff@victoria.test", password: "not-staff-pass-1", email_confirm: true });'
status=0
for t in tests/e2e/*.e2e.mjs; do echo "== $t"; node "$t" || status=1; done
exit $status
