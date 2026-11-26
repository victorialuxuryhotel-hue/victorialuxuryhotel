import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { as, check, clickText, finish, go, PHOTOS, run, session, text, until, val, waitForText } from "./lib.mjs";

const realImage = resolve("public/brand/logo-mark.png");
const dir = mkdtempSync(join(tmpdir(), "victoria-photos-"));
const fakeImage = join(dir, "holiday.jpg");
writeFileSync(fakeImage, "<html><script>alert('not a photo')</script></html>");

const publicImages = async (path) => {
  const { ctx, p } = await session();
  await go(p, path);
  await new Promise((r) => setTimeout(r, 1000));
  const srcs = await p.$$eval("img", (imgs) => imgs.map((i) => decodeURIComponent(i.currentSrc || i.src)));
  await ctx.close();
  return srcs;
};

const cat = await val("SELECT id FROM room_categories WHERE slug = 'deluxe'");
const hadPhotos = (await val("SELECT count(*) FROM room_category_images WHERE category_id = ?", cat)) > 0;
const tag = `Deluxe test photo ${Date.now()}`;
const startedAt = new Date().toISOString();

{
  const { ctx, p } = await as("hotel_manager");
  await go(p, `/app/rooms/categories/${cat}`);
  await (await p.waitForSelector("input[type=file][name=file]")).uploadFile(fakeImage);
  await p.type("form:has(input[type=file]) input[name=altText]", "Not really a photo");
  await clickText(p, "button", "Upload photo");
  await waitForText(p, /Only JPEG, PNG or WebP/);
  check("a file that isn't really an image is refused", (await val("SELECT count(*) FROM room_category_images WHERE alt_text = 'Not really a photo'")) === 0);

  await go(p, `/app/rooms/categories/${cat}`);
  await (await p.waitForSelector("input[type=file][name=file]")).uploadFile(realImage);
  await p.type("form:has(input[type=file]) input[name=altText]", tag);
  await clickText(p, "button", "Upload photo");
  await waitForText(p, /Photo uploaded/);
  const path = await val("SELECT storage_path FROM room_category_images WHERE alt_text = ?", tag);
  check("hotel manager uploads a room photo", typeof path === "string" && path.startsWith(`rooms/${cat}/`), String(path));
  check("the file is in the photo store", Boolean(await PHOTOS.head(path)));
  const isCover = (await val("SELECT is_cover FROM room_category_images WHERE alt_text = ?", tag)) === 1;
  check(hadPhotos ? "an extra photo doesn't replace the existing cover" : "first photo becomes the cover", isCover === !hadPhotos);
  await ctx.close();

  const imgs = await publicImages("/rooms/deluxe");
  check("photo appears on the public room page at once", imgs.some((s) => s.includes(path)), imgs.slice(0, 3).join(" "));
  if (!hadPhotos) check("and on the rooms list as the cover", (await publicImages("/rooms")).some((s) => s.includes(path)));

  const { ctx: c2, p: p2 } = await as("hotel_manager");
  p2.on("dialog", (d) => d.accept());
  await go(p2, `/app/rooms/categories/${cat}`);
  await p2.evaluate((alt) => {
    const card = [...document.querySelectorAll("li")].find((li) => li.querySelector(`img[alt="${alt}"]`));
    card?.querySelector('button:has([aria-label="Delete photo"])')?.click();
  }, tag);
  const gone = await until(async () => (await val("SELECT count(*) FROM room_category_images WHERE alt_text = ?", tag)) === 0, "photo record removed").catch(() => false);
  check("deleting removes the record", gone);
  check("and the stored file", (await until(async () => !(await PHOTOS.head(path)), "file removed").catch(() => false)) === true);
  await c2.close();
  check("and it disappears from the public page", !(await publicImages("/rooms/deluxe")).some((s) => s.includes(path)));
}

{
  const { ctx, p } = await as("hotel_manager");
  await go(p, "/app/settings/photos");
  await (await p.waitForSelector("summary")).click();
  const form = await p.waitForSelector("details[open] form");
  await (await form.$("input[type=file]")).uploadFile(realImage);
  await (await form.$("input[name=altText]")).type("Hotel façade at dusk (test)");
  await (await form.$("button[type=submit]")).click();
  await waitForText(p, /Photo uploaded/);
  const hero = await val("SELECT storage_path FROM site_photos WHERE slot = 'hero' ORDER BY rowid DESC LIMIT 1");
  check("hotel manager sets the homepage hero photo", typeof hero === "string" && hero.startsWith("site/hero/"), String(hero));
  await ctx.close();
  check("homepage shows the new hero", (await publicImages("/")).some((s) => s.includes(hero)));
}

{
  const { ctx, p } = await as("front_desk");
  await go(p, "/app/settings/photos");
  check("front desk cannot open website photos", /don.t have access/.test(await text(p)));
  await ctx.close();
}

check(
  "photo changes are in the activity log",
  (await val("SELECT count(*) FROM activity_log WHERE action IN ('photo.added', 'photo.removed') AND created_at >= ?", startedAt)) >= 3,
);
await run("DELETE FROM site_photos WHERE slot = 'hero' AND alt_text LIKE '%(test)'").catch(() => {});

await finish();
