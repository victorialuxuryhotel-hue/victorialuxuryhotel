import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = "http://localhost:3000";
const sql = (q) => execSync(`docker exec -i supabase_db_victoria-hotel psql -U postgres -qtA`, { input: q }).toString().trim();
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const waitText = (p, re, timeout = 20000) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout }, re.source);

const realImage = resolve("public/brand/logo-mark.png");
const dir = mkdtempSync(join(tmpdir(), "victoria-photos-"));
const fakeImage = join(dir, "holiday.jpg");
writeFileSync(fakeImage, "<html><script>alert('not a photo')</script></html>");

async function signIn(email) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await p.type("#email", email);
  await p.type("#password", "victoria-dev-2026!");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => location.pathname === "/app", { timeout: 20000 });
  return { ctx, p };
}
const publicImages = async (path) => {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 1000));
  const srcs = await p.$$eval("img", (imgs) => imgs.map((i) => decodeURIComponent(i.currentSrc || i.src)));
  await ctx.close();
  return srcs;
};

const cat = sql("select id from room_categories where slug = 'deluxe';");
sql("delete from room_category_images where alt_text like 'Deluxe test photo%' or alt_text = 'Not really a photo';");
sql("delete from site_photos where alt_text like '%(test)%';");
const hadPhotos = sql(`select count(*) from room_category_images where category_id = '${cat}';`) !== "0";
const tag = `Deluxe test photo ${Date.now()}`;

{
  const { ctx, p } = await signIn("gm@victoria.test");
  await p.goto(`${BASE}/app/rooms/categories/${cat}`, { waitUntil: "networkidle0" });
  await p.waitForSelector('input[type=file][name=file]');

  await (await p.$('input[type=file][name=file]')).uploadFile(fakeImage);
  await p.type("form:has(input[type=file]) input[name=altText]", "Not really a photo");
  await p.click("button::-p-text(Upload photo)");
  await waitText(p, /Only JPEG, PNG or WebP/);
  check("a file that isn't really an image is refused", sql(`select count(*) from room_category_images where alt_text = 'Not really a photo';`) === "0");

  await p.reload({ waitUntil: "networkidle0" });
  await (await p.$('input[type=file][name=file]')).uploadFile(realImage);
  await p.type("form:has(input[type=file]) input[name=altText]", tag);
  await p.click("button::-p-text(Upload photo)");
  await waitText(p, /Photo uploaded/);
  const path = sql(`select storage_path from room_category_images where alt_text = '${tag}';`);
  check("manager uploads a room photo", path.startsWith(`${cat}/`), path);
  const isCover = sql(`select is_cover from room_category_images where alt_text = '${tag}';`).startsWith("t");
  check(hadPhotos ? "an extra photo doesn't replace the existing cover" : "first photo becomes the cover", isCover === !hadPhotos);
  await ctx.close();

  const imgs = await publicImages("/rooms/deluxe");
  check("photo appears on the public room page at once", imgs.some((s) => s.includes(path)), imgs.slice(0, 3).join(" "));
  const listImgs = await publicImages("/rooms");
  if (!hadPhotos) check("and on the rooms list as the cover", listImgs.some((s) => s.includes(path)));
}

{
  const { ctx, p } = await signIn("gm@victoria.test");
  await p.goto(`${BASE}/app/settings/photos`, { waitUntil: "networkidle0" });
  await p.waitForSelector("summary");
  const heroBlock = (await p.$$("summary"))[0];
  await heroBlock.click();
  const form = await p.$("details[open] form");
  await (await form.$('input[type=file]')).uploadFile(realImage);
  await (await form.$('input[name=altText]')).type("Hotel façade at dusk (test)");
  await (await form.$("button[type=submit]")).click();
  await waitText(p, /Photo uploaded/);
  const hero = sql("select storage_path from site_photos where slot = 'hero';");
  check("manager sets the homepage hero photo", hero.startsWith("hero/"), hero);
  await ctx.close();
  const imgs = await publicImages("/");
  check("homepage shows the new hero", imgs.some((s) => s.includes(hero)));
}

{
  const { ctx, p } = await signIn("frontdesk@victoria.test");
  await p.goto(`${BASE}/app/settings/photos`, { waitUntil: "networkidle0" });
  await waitText(p, /don.t have access/);
  check("front desk cannot open website photos", true);
  await ctx.close();
}

{
  const { ctx, p } = await signIn("gm@victoria.test");
  await p.goto(`${BASE}/app/rooms/categories/${cat}`, { waitUntil: "networkidle0" });
  const path = sql(`select storage_path from room_category_images where alt_text = '${tag}';`);
  p.on("dialog", (d) => d.accept());
  await p.evaluate((alt) => {
    const card = [...document.querySelectorAll("li")].find((li) => li.querySelector(`img[alt="${alt}"]`));
    card?.querySelector('button:has([aria-label="Delete photo"])')?.click();
  }, tag);
  await p.waitForFunction((t) => ![...document.images].some((i) => decodeURIComponent(i.currentSrc || i.src).includes(t)), { timeout: 20000 }, path);
  check("deleting removes the record", sql(`select count(*) from room_category_images where alt_text = '${tag}';`) === "0");
  check("and the stored file", sql(`select count(*) from storage.objects where bucket_id = 'room-images' and name = '${path}';`) === "0");
  await ctx.close();
  const imgs = await publicImages("/rooms/deluxe");
  check("and it disappears from the public page", !imgs.some((s) => s.includes(path)));
  check("photo changes are in the activity log", Number(sql("select count(*) from activity_log where action in ('photo.added', 'photo.removed') and created_at > now() - interval '5 minutes';")) >= 3);
}

sql("delete from site_photos where slot = 'hero' and alt_text like '%(test)';");

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
