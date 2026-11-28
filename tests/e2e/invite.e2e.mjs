import { randomBytes } from "node:crypto";
import { as, BASE, passBotCheck, check, clerk, clickText, fill, finish, go, navLabels, one, session, settle, text, until, val, waitForText } from "./lib.mjs";

const stamp = Date.now();
const email = `e2e-invite-${stamp}+clerk_test@victorialuxuryhotel.com`;
const invitee = `New Receptionist ${stamp.toString(36)}`;
const list = (r) => (Array.isArray(r) ? r : (r?.data ?? []));
const pendingInvites = async () => list(await clerk("GET", `/invitations?status=pending&query=${encodeURIComponent(email)}`));
/** Clerk's invitation link redirects to our accept page with the ticket attached; return that redirect. */
const acceptUrl = async (invite) => new URL((await fetch(invite.url, { redirect: "manual" })).headers.get("location") ?? "", BASE);

{
  const { ctx, p } = await as("owner");
  await go(p, "/app/staff");
  await clickText(p, "a", "Invite someone");
  await fill(p, "#sname", invitee);
  await fill(p, "#semail", email);
  await clickText(p, "button", "Send invitation");
  await waitForText(p, /Invitation sent to|already|Could not/);
  check("owner sees the invitation confirmation", (await text(p)).includes(`Invitation sent to ${email}`));
  const staff = await one("SELECT id, role, clerk_user_id FROM staff_profiles WHERE email = ?", email);
  check("staff record created as front desk, not yet linked", staff?.role === "front_desk" && staff?.clerk_user_id === null, JSON.stringify(staff));
  check("the invitation is in the activity log", (await val("SELECT count(*) FROM activity_log WHERE action = 'staff.created' AND entity_id = ?", staff?.id)) === 1);
  const invites = await pendingInvites();
  const landing = invites[0] ? await acceptUrl(invites[0]) : null;
  check("Clerk holds one pending invitation that returns to the app", invites.length === 1 && landing?.pathname === "/auth/accept", String(landing));

  await go(p, "/app/staff");
  await clickText(p, "button", invitee).catch(() => clickText(p, "a", invitee));
  await clickText(p, "button", "Send the invitation again");
  await waitForText(p, /Invitation sent again/);
  const again = await pendingInvites();
  check("sending again replaces the old invitation", again.length === 1 && again[0].id !== invites[0]?.id, `old ${invites[0]?.id} now ${JSON.stringify(again.map((i) => i.id))}`);
  await ctx.close();
}

let password;
{
  const [invite] = await pendingInvites();
  const landing = await acceptUrl(invite);
  const { ctx, p } = await session();
  await passBotCheck(p);
  await go(p, `${landing.pathname}${landing.search}`);
  password = randomBytes(12).toString("base64url");
  await p.waitForSelector("input[name=password]", { visible: true, timeout: 30000 });
  const name = `e2e_new_${Date.now().toString(36)}`;
  const fillUsername = async () => { if (await p.$("input[name=username]")) await fill(p, "input[name=username]", name).catch(() => {}); };
  await fillUsername();
  await fill(p, "input[name=password]", "short");
  await clickText(p, "button", "Continue");
  await waitForText(p, /at least|too short|characters/i);
  check("a short password is refused", (await val("SELECT clerk_user_id FROM staff_profiles WHERE email = ?", email)) === null);
  await fill(p, "input[name=password]", password);
  await fillUsername();
  await clickText(p, "button", "Continue");
  // Clerk may ask for the username on a second "continue" step.
  await until(async () => p.url().includes("/app") || (await p.$("input[name=username]")), "next step", 30000).catch(() => {});
  if (!p.url().includes("/app") && (await p.$("input[name=username]"))) {
    await fillUsername();
    await clickText(p, "button", "Continue", 5000).catch(() => {});
  }
  await p.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 45000 }).catch(() => {});
  await settle(p);
  check("accepting the invitation signs them in to the app", p.url().startsWith(`${BASE}/app`), p.url());
  const linked = await until(() => val("SELECT clerk_user_id FROM staff_profiles WHERE email = ?", email), "staff linked").catch(() => null);
  check("their Clerk account is linked to the staff record", Boolean(linked));
  const nav = (await navLabels(p)).join(",");
  check("and they get the front-desk menu", nav.includes("Bookings") && !nav.includes("Booking rules"), nav);
  check("front desk is not asked for two-step sign-in", !p.url().includes("/two-step"), p.url());
  await ctx.close();
}

{
  const { ctx, p } = await session();
  await passBotCheck(p);
  const [used] = list(await clerk("GET", `/invitations?query=${encodeURIComponent(email)}`));
  const again = await acceptUrl(used);
  await go(p, `${again.pathname}${again.search}`);
  await settle(p);
  await new Promise((r) => setTimeout(r, 2000));
  check("the invitation link cannot be used again", !p.url().startsWith(`${BASE}/app`), p.url());
  await ctx.close();
}

{
  const { ctx, p } = await as("owner");
  p.on("dialog", (d) => d.accept());
  await go(p, "/app/staff");
  await clickText(p, "button", invitee).catch(() => clickText(p, "a", invitee));
  await clickText(p, "button", "Remove access");
  await until(async () => (await val("SELECT is_active FROM staff_profiles WHERE email = ?", email)) === 0, "deactivated");
  const user = await clerk("GET", `/users/${await val("SELECT clerk_user_id FROM staff_profiles WHERE email = ?", email)}`);
  check("removing access deactivates them and bans them in Clerk", user.banned === true);
  await ctx.close();
  await clerk("DELETE", `/users/${user.id}`).catch(() => {});
}

await finish();
