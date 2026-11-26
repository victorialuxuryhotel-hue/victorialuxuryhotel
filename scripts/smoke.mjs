// Smoke test after a deploy: the site answers, the public pages load, staff pages need sign-in, and
// sign-in uses the expected Clerk key type. Exits non-zero on any failure (the deploy pipeline rolls
// back). Usage: node scripts/smoke.mjs https://victorialuxuryhotel.com live
const [base, keyType = "live"] = process.argv.slice(2);
if (!base) {
  console.error("Usage: node scripts/smoke.mjs <site url> [live|test]");
  process.exit(2);
}
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✘"} ${what}`);
  if (!ok) failures.push(what);
};
async function get(path, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...opts });
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

const health = await get("/api/health");
check(health.status === 200 && (await health.json().catch(() => ({}))).ok === true, "/api/health is ok");
for (const path of ["/", "/rooms", "/book", "/gallery", "/about", "/login"]) {
  check((await get(path)).status === 200, `${path} loads`);
}
const app = await get("/app");
check([302, 303, 307].includes(app.status) && (app.headers.get("location") ?? "").includes("/login"), "/app sends staff to sign-in");
const login = await (await get("/login")).text();
check(login.includes(`pk_${keyType}_`), `sign-in uses a pk_${keyType} Clerk key`);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
