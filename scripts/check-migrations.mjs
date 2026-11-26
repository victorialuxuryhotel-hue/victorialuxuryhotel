// Migrations are append-only: once a migration is in migrations/migrations.lock.json (because it has
// shipped, or is about to), its file must never change. A new migration must be added to the lock in
// the same change. CI runs this. Update the lock with:  node scripts/check-migrations.mjs --add
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const LOCK = "migrations/migrations.lock.json";
const files = readdirSync("migrations").filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const sha = (f) => createHash("sha256").update(readFileSync(`migrations/${f}`)).digest("hex");
const lock = JSON.parse(readFileSync(LOCK, "utf8"));

if (process.argv.includes("--add")) {
  for (const f of files) lock[f] ??= sha(f);
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Lock has ${Object.keys(lock).length} migrations.`);
  process.exit(0);
}

const problems = [];
for (const [f, hash] of Object.entries(lock)) {
  if (!files.includes(f)) problems.push(`${f} is in the lock but the file is gone (migrations are never deleted).`);
  else if (sha(f) !== hash) problems.push(`${f} changed after it was locked. Write a new migration instead.`);
}
for (const f of files) if (!(f in lock)) problems.push(`${f} isn't in ${LOCK}. Run: node scripts/check-migrations.mjs --add`);
const numbers = files.map((f) => f.slice(0, 4));
for (const n of new Set(numbers)) if (numbers.filter((x) => x === n).length > 1) problems.push(`Two migrations are numbered ${n}.`);

if (problems.length) {
  console.error(problems.map((p) => `✘ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${files.length} migrations, none changed after locking.`);
