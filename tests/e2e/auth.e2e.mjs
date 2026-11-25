import { as, BASE, check, clickText, createUser, deleteUser, fill, finish, go, navLabels, one, run, session, signIn, signOut, text, val, waitForText, account } from "./lib.mjs";

const groups = async (p) => (await navLabels(p)).join(",");

{ const { ctx, p } = await session();
  await go(p, "/app/reservations");
  check("signed-out visitor is sent to sign-in", p.url().startsWith(`${BASE}/login?next=%2Fapp%2Freservations`), p.url());
  await ctx.close(); }

{ const desk = await account("front_desk");
  const { ctx, p } = await session();
  await signIn(p, desk, { password: "wrong-password-1" });
  check("wrong password is refused with a plain message", p.url().includes("/login") && (await text(p)).includes("That username or password isn't right"));
  await signIn(p, { email: "nobody-e2e+clerk_test@victorialuxuryhotel.com", password: "whatever-123456" });
  check("unknown account gets the same message", (await text(p)).includes("That username or password isn't right"));
  await ctx.close(); }

{ const outsider = await createUser("not-staff", null);
  const { ctx, p } = await session();
  await signIn(p, outsider);
  await go(p, "/app");
  check("a Clerk account with no staff record is refused", (await text(p)).includes("doesn't have access to hotel management"), p.url());
  await clickText(p, "button", "Sign out and use another account");
  await p.waitForFunction(() => document.querySelector("#identifier"));
  await go(p, "/app");
  check("and has no session afterwards", p.url().includes("/login?next"), p.url());
  await ctx.close();
  await deleteUser(outsider); }

{ const { ctx, p, acc } = await as("front_desk", { fresh: true, next: "?next=%2Fapp%2Frooms" });
  check("front desk signs in and returns to the requested page", p.url() === `${BASE}/app/rooms`, p.url());
  const nav = await groups(p);
  check("front desk menu: daily work only", nav.includes("Bookings") && nav.includes("Hall bookings") && !nav.includes("Booking rules") && !nav.includes("Till") && !nav.includes("Dashboard"), nav);
  await go(p, "/app/settings");
  check("front desk opening Booking rules directly is refused", (await text(p)).includes("You don't have access to this page"));
  await go(p, "/app/staff");
  check("front desk opening Staff & access directly is refused", (await text(p)).includes("You don't have access to this page"));
  check("front desk is not asked for two-step sign-in", !p.url().includes("/two-step"), p.url());
  await run("UPDATE staff_profiles SET is_active = 0 WHERE clerk_user_id = ?", acc.clerkUserId);
  await go(p, "/app/today");
  check("deactivated mid-session: the next page is refused", (await text(p)).includes("doesn't have access to hotel management") || p.url().includes("/login"), p.url());
  await run("UPDATE staff_profiles SET is_active = 1 WHERE clerk_user_id = ?", acc.clerkUserId);
  await ctx.close(); }

{ const { ctx, p } = await as("restaurant_bar");
  const nav = await groups(p);
  check("restaurant & bar staff see the till, orders and closing only", nav === "Till,Orders & receipts,Daily closing", nav);
  await go(p, "/app/reservations");
  check("restaurant & bar staff cannot open reservations", (await text(p)).includes("You don't have access to this page"));
  await ctx.close(); }

{ const { ctx, p } = await as("hotel_manager");
  const nav = await groups(p);
  check("hotel manager runs the hotel side", nav.includes("Bookings") && nav.includes("Rates & room types") && nav.includes("Booking rules") && nav.includes("Reports"), nav);
  check("hotel manager sees no restaurant & bar, dashboard or staff", !nav.includes("Orders & receipts") && !nav.includes("Dashboard") && !nav.includes("Staff & access"), nav);
  await go(p, "/app/sales/reports");
  check("hotel manager cannot open restaurant & bar sales", (await text(p)).includes("You don't have access to this page"));
  await ctx.close(); }

{ const { ctx, p } = await as("finance");
  const nav = await groups(p);
  check("finance sees money only", nav === "Payments,Orders & receipts,Daily closing,Stock,Sales reports,Dashboard,Reports", nav);
  await go(p, "/app/reservations");
  const bookings = await text(p);
  check("finance can read bookings but not create one", bookings.includes("Bookings") && !bookings.includes("You don't have access") && !bookings.includes("New booking"));
  await go(p, "/app/payments");
  const t = await text(p);
  check("finance payments page has no record or correct buttons", !/Take payment|Correct|Refund/.test(t), t.slice(0, 200));
  await ctx.close(); }

{ const { ctx, p, acc } = await as("general_manager");
  await go(p, "/app/settings");
  const t = await text(p);
  check("GM sees booking rules", t.includes("Booking rules") && t.includes("Save rules"));
  const nav = await groups(p);
  check("GM has no staff management", !nav.includes("Staff & access"), nav);
  await fill(p, "#whold", 45);
  await clickText(p, "button", "Save rules");
  await waitForText(p, /Booking rules saved|Check the highlighted/).catch(() => {});
  check("GM saves a booking rule", (await text(p)).includes("Booking rules saved"));
  check("rule saved in the database", (await val("SELECT website_hold_minutes FROM hotel_settings")) === 45);
  const audit = await one("SELECT a.action, s.clerk_user_id FROM activity_log a JOIN staff_profiles s ON s.id = a.actor_id WHERE a.action = 'settings.updated' ORDER BY a.rowid DESC LIMIT 1");
  check("change is in the activity log, attributed to the GM", audit?.clerk_user_id === acc.clerkUserId, JSON.stringify(audit));
  await run("UPDATE hotel_settings SET website_hold_minutes = 30");
  await go(p, "/app/settings");
  await p.$eval("#whold", (el) => { el.removeAttribute("min"); });
  await fill(p, "#whold", 1);
  await clickText(p, "button", "Save rules");
  await waitForText(p, /At least 10 minutes/).catch(() => {});
  check("server refuses an invalid hold time", (await text(p)).includes("At least 10 minutes") && (await val("SELECT website_hold_minutes FROM hotel_settings")) === 30);
  await ctx.close(); }

{ const owner = await account("owner");
  const { ctx, p } = await session();
  await signIn(p, owner, { next: "?next=https%3A%2F%2Fevil.example" });
  check("open redirect attempt lands inside the app instead", p.url().startsWith(`${BASE}/app`), p.url());
  await go(p, "/app/staff");
  const t = await text(p);
  check("owner sees staff management", t.includes("Staff & access") && /Invite|Send invitation/.test(t));
  await signOut(p);
  await go(p, "/app");
  check("after sign out /app is protected again", p.url().includes("/login"), p.url());
  await ctx.close(); }

await finish();
