/**
 * Production bootstrap: creates the hotel's FIRST owner. Everyone else is
 * invited from the app (Settings → Staff).
 *
 *   CLERK_SECRET_KEY=sk_live_… NEXT_PUBLIC_SITE_URL=https://hotel-domain \
 *     pnpm staff:create-owner --email owner@hotel.com --name "Full Name" [--local]
 *
 * 1. Adds the owner's staff record to D1 (production unless --local).
 * 2. Sends a Clerk invitation; the owner sets a password at /auth/accept and is
 *    linked to the record by email on first sign-in.
 * Refuses if an active owner already exists.
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, local: { type: "boolean", default: false } } });

function fail(message: string): never {
  console.error(`create-owner: ${message}`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("--email is required");
if (!name || name.length < 2) fail("--name is required");
const clerkKey = process.env.CLERK_SECRET_KEY ?? fail("set CLERK_SECRET_KEY");
const site = process.env.NEXT_PUBLIC_SITE_URL ?? fail("set NEXT_PUBLIC_SITE_URL");

const target = values.local ? "--local" : "--remote";
const d1 = (sql: string) =>
  JSON.parse(execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "victoria-hotel-db", target, "--json", "--command", sql], { encoding: "utf8" })) as Array<{
    results: Array<Record<string, unknown>>;
  }>;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

if (d1("SELECT 1 FROM staff_profiles WHERE role = 'owner' AND is_active = 1")[0]!.results.length) {
  fail("an active owner already exists; invite staff from the app instead");
}

const res = await fetch("https://api.clerk.com/v1/invitations", {
  method: "POST",
  headers: { authorization: `Bearer ${clerkKey}`, "content-type": "application/json" },
  body: JSON.stringify({ email_address: email, redirect_url: `${site}/auth/accept`, notify: true, ignore_existing: true }),
});
if (!res.ok) fail(`Clerk invitation failed (${res.status}): ${await res.text()}`);

d1(`INSERT INTO staff_profiles (id, full_name, email, role) VALUES (${lit(crypto.randomUUID())}, ${lit(name)}, ${lit(email)}, 'owner')`);
console.log(`Owner ${name} <${email}> created. Clerk has emailed them an invitation to set their password.`);
