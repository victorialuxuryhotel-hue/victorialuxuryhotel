// Runs after `opennextjs-cloudflare build`. OpenNext copies every .env value into the Worker;
// secrets must come only from `wrangler secret put`, so they are removed here and the build
// output is scanned for any secret value or key pattern. Exits non-zero on a find.
import fs from "node:fs";
import path from "node:path";

const PUBLIC = new Set(["EMAIL_FROM", "HOTEL_NOTIFY_EMAIL", "PAYSTACK_BASE_URL", "RESEND_BASE_URL", "RATE_LIMIT_HOLDS_PER_HOUR", "RATE_LIMIT_PAYMENTS_PER_HOUR"]);
const isPublic = (key) => key.startsWith("NEXT_PUBLIC_") || PUBLIC.has(key);

const envFile = path.join(".open-next", "cloudflare", "next-env.mjs");
if (!fs.existsSync(envFile)) {
  console.error(`${envFile} not found. Run the OpenNext build first.`);
  process.exit(1);
}
const mod = await import(path.resolve(envFile) + `?t=${Date.now()}`);
const removed = new Set();
const out = Object.entries(mod).map(([mode, vars]) => {
  const kept = Object.fromEntries(Object.entries(vars).filter(([k]) => isPublic(k) || (removed.add(k), false)));
  return `export const ${mode} = ${JSON.stringify(kept)};\n`;
});
fs.writeFileSync(envFile, out.join(""));
if (removed.size) console.log(`Removed from the Worker build: ${[...removed].sort().join(", ")}`);

const secrets = new Map();
for (const file of fs.readdirSync(".").filter((f) => f.startsWith(".env") && f !== ".env.example")) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\s]+)"?/);
    if (m && !isPublic(m[1]) && m[2].length >= 12) secrets.set(m[2], m[1]);
  }
}
const PATTERNS = [/sk_(test|live)_[A-Za-z0-9]{20,}/, /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/, /whsec_[A-Za-z0-9]{20,}/];

const finds = [];
const seen = new Set();
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  const real = fs.realpathSync(dir);
  if (seen.has(real)) return;
  seen.add(real);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const stat = fs.statSync(p, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) { scan(p); continue; }
    if (/\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|wasm)$/i.test(entry.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const [value, key] of secrets) if (text.includes(value)) finds.push(`${key} value in ${p}`);
    for (const re of PATTERNS) if (re.test(text)) finds.push(`${re.source.split("_")[0]}… key pattern in ${p}`);
  }
}
scan(".open-next");
scan(path.join(".next", "static"));

if (finds.length) {
  console.error("Secrets found in the build output (values not shown):");
  for (const f of [...new Set(finds)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`No secrets in the build output (${secrets.size} known values and ${PATTERNS.length} key patterns checked).`);
