/**
 * Creates a staff account (auth user + staff profile).
 *
 * Production bootstrap (the first owner; everyone else is invited from the app):
 *   node --env-file=.env.production.local scripts/create-staff.mts \
 *     --email owner@hotel.com --name "Full Name" --role owner
 *   → sends a Supabase invite email so the person sets their own password.
 *
 * Local development (fixed password, no email):
 *   node --env-file=.env.local scripts/create-staff.mts --email a@b.c --name "A B" --role front_desk --password '...'
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const roles = ["owner", "general_manager", "front_desk"] as const;
type Role = (typeof roles)[number];

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    password: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`create-staff: ${message}`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
const role = values.role as Role | undefined;
if (!email || !name || !role) fail("--email, --name and --role are required");
if (!roles.includes(role)) fail(`--role must be one of ${roles.join(", ")}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (use --env-file)");
if (values.password && !/127\.0\.0\.1|localhost/.test(url)) fail("--password is only allowed against a local database; use the invite flow");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: created, error } = values.password
  ? await admin.auth.admin.createUser({ email, password: values.password, email_confirm: true })
  : await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/app/account` });

if (error || !created.user) fail(`could not create auth user: ${error?.message}`);

const { error: profileError } = await admin.from("staff_profiles").insert({ id: created.user.id, full_name: name, email, role });
if (profileError) {
  // Don't leave an auth user without a staff profile behind.
  await admin.auth.admin.deleteUser(created.user.id);
  fail(`could not create staff profile: ${profileError.message}`);
}

console.log(`Created ${role} ${email}${values.password ? "" : " (invite email sent)"}`);
