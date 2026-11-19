#!/usr/bin/env bash
# LOCAL ONLY: one account per role for development and manual testing.
# Password for all: see DEV_STAFF_PASSWORD below. Never use these anywhere else.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV_STAFF_PASSWORD="${DEV_STAFF_PASSWORD:-victoria-dev-2026!}"
# After `supabase db reset` the auth service restarts; wait until it answers.
for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:54321/auth/v1/health && break; sleep 1; done
run() { node --env-file=.env.local scripts/create-staff.mts --password "$DEV_STAFF_PASSWORD" "$@"; }
run --email owner@victoria.test --name "Dev Owner" --role owner
run --email gm@victoria.test --name "Dev Manager" --role general_manager
run --email frontdesk@victoria.test --name "Dev Front Desk" --role front_desk
