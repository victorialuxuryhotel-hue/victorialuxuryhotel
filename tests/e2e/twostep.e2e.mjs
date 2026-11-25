// Two-step sign-in in a real browser: a new Finance account sets up an authenticator app and signs in with it.
import { BASE, check, clerk, createUser, deleteUser, enrolAuthenticator, finish, freshTotp, go, session, signIn, signOut, text, twoStepAvailable, waitForText } from "./lib.mjs";

if (!(await twoStepAvailable())) {
  console.log("SKIP  two-step sign-in: authenticator apps are off in this Clerk instance (turn them on under Configure → Multi-factor)");
  await finish();
}

const acc = await createUser(`twostep-${Date.now().toString(36)}`, "finance");
try {
  {
    const { ctx, p } = await session();
    await signIn(p, acc);
    await go(p, "/app/reports");
    check("without an authenticator app, every page sends them to set one up", p.url().startsWith(`${BASE}/two-step`), p.url());
    check("the page explains what to do", /Add two-step verification/.test(await text(p)));
    const status = await p.evaluate(async () => (await fetch("/app/reports/income-csv", { redirect: "manual" })).status);
    check("downloads are refused before set-up too", status !== 200, String(status));

    Object.assign(acc, await enrolAuthenticator(p));
    check("the authenticator app is set up", (await clerk("GET", `/users/${acc.clerkUserId}`)).totp_enabled === true);
    check("backup codes are shown", acc.backupCodes.length >= 5, String(acc.backupCodes.length));
    await go(p, "/app/reports");
    check("the session that set it up didn't use it, so it must sign in again", p.url().includes("/two-step") && /Sign in again/.test(await text(p)), p.url());
    await signOut(p);
    await ctx.close();
  }

  {
    const { ctx, p } = await session();
    await signIn(p, acc, { code: "000000" });
    check("after the password, it asks for the app code", /authenticator app/i.test(await text(p)));
    await waitForText(p, /That code isn't right/);
    check("a wrong code is refused with a plain message", p.url().includes("/login"));
    await ctx.close();
  }

  {
    const { ctx, p } = await session();
    await signIn(p, acc, { code: await freshTotp(acc.secret) });
    check("the right app code signs them in", p.url().startsWith(`${BASE}/app`) && !p.url().includes("two-step"), p.url());
    await go(p, "/app/reports");
    check("and the pages open", (await text(p)).includes("Reports") && !p.url().includes("two-step"), p.url());
    await signOut(p);
    await ctx.close();
  }

  {
    const { ctx, p } = await session();
    await go(p, "/login");
    await p.type("#identifier", acc.email);
    await p.type("#password", acc.password);
    await p.click("button[type=submit]");
    await p.waitForSelector("#code");
    await p.click("button::-p-text(Lost your phone? Use a backup code)");
    await p.type("#code", acc.backupCodes[0]);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => location.pathname.startsWith("/app") || document.querySelector("[role=alert]"), { timeout: 30000 });
    check("a backup code works if the phone is lost", p.url().startsWith(`${BASE}/app`), p.url());
    await signOut(p);
    await ctx.close();
  }

  {
    const { ctx, p } = await session();
    await go(p, "/login");
    await p.type("#identifier", acc.email);
    await p.type("#password", acc.password);
    await p.click("button[type=submit]");
    await p.waitForSelector("#code");
    await p.click("button::-p-text(Lost your phone? Use a backup code)");
    await p.type("#code", acc.backupCodes[0]);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => location.pathname.startsWith("/app") || document.querySelector("[role=alert]"), { timeout: 30000 });
    check("the same backup code can't be used twice", p.url().includes("/login"), p.url());
    await ctx.close();
  }
} finally {
  await deleteUser(acc);
}

await finish();
