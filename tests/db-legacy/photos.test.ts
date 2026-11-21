import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, makeUser, type TestUser } from "./api-helpers";

/** Photo storage and records: who may upload, what the public sees, integrity. */

let desk: TestUser, gm: TestUser;
let categoryId: string;
const png = readFileSync("public/brand/logo-mark.png");

beforeAll(async () => {
  [desk, gm] = await Promise.all([makeUser("front_desk"), makeUser("general_manager")]);
  const { data } = await admin.from("room_categories").select("id").eq("slug", "standard").single();
  categoryId = data!.id;
});

// Tests share the local database with the dev site: remove every record and
// file they create, so the website never shows broken test images.
const path = (prefix: string) => `${prefix}/test-${randomUUID()}.png`;

afterAll(async () => {
  await admin.from("site_photos").delete().like("storage_path", "%/test-%");
  await admin.from("room_category_images").delete().like("storage_path", "%/test-%");
  for (const bucket of ["room-images", "site-images"]) {
    const { data: folders } = await admin.storage.from(bucket).list("", { limit: 1000 });
    for (const f of folders ?? []) {
      const { data: files } = await admin.storage.from(bucket).list(f.name, { limit: 1000 });
      const tests = (files ?? []).filter((x) => x.name.startsWith("test-")).map((x) => `${f.name}/${x.name}`);
      if (tests.length) await admin.storage.from(bucket).remove(tests);
    }
  }
});

describe("storage permissions", () => {
  it("managers can upload room and website photos", async () => {
    expect((await gm.client.storage.from("room-images").upload(path(categoryId), png, { contentType: "image/png" })).error).toBeNull();
    expect((await gm.client.storage.from("site-images").upload(path("hero"), png, { contentType: "image/png" })).error).toBeNull();
  });

  it("front desk and visitors cannot upload", async () => {
    expect((await desk.client.storage.from("room-images").upload(path(categoryId), png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await desk.client.storage.from("site-images").upload(path("hero"), png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await anon().storage.from("site-images").upload(path("hero"), png, { contentType: "image/png" })).error).not.toBeNull();
  });

  it("only image types are accepted by the bucket", async () => {
    const { error } = await gm.client.storage.from("site-images").upload(`hero/${randomUUID()}.html`, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" });
    expect(error).not.toBeNull();
  });

  it("anyone can view uploaded photos", async () => {
    const p = path("pool");
    await gm.client.storage.from("site-images").upload(p, png, { contentType: "image/png" });
    const url = anon().storage.from("site-images").getPublicUrl(p).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
  });
});

describe("photo records", () => {
  it("visitors see website photos but cannot change them; front desk cannot either", async () => {
    const { data: row, error } = await gm.client.from("site_photos").insert({ slot: "spa", storage_path: path("spa"), alt_text: "Spa heated room" }).select("id").single();
    expect(error).toBeNull();
    expect((await anon().from("site_photos").select("id").eq("id", row!.id)).data).toHaveLength(1);
    expect((await anon().from("site_photos").delete().eq("id", row!.id).select()).data ?? []).toEqual([]);
    expect((await desk.client.from("site_photos").delete().eq("id", row!.id).select()).data ?? []).toEqual([]);
    expect((await desk.client.from("site_photos").insert({ slot: "bar", storage_path: path("bar"), alt_text: "Bar at night" }).select()).error).not.toBeNull();
    await admin.from("site_photos").delete().eq("id", row!.id);
  });

  it("each website place holds one photo; the gallery holds many, each in a section", async () => {
    await admin.from("site_photos").delete().eq("slot", "restaurant");
    expect((await gm.client.from("site_photos").insert({ slot: "restaurant", storage_path: path("restaurant"), alt_text: "Dinner table" })).error).toBeNull();
    expect((await gm.client.from("site_photos").insert({ slot: "restaurant", storage_path: path("restaurant"), alt_text: "Second dinner" })).error).not.toBeNull();
    expect((await gm.client.from("site_photos").insert({ slot: "gallery", storage_path: path("gallery"), alt_text: "No section" })).error).not.toBeNull();
    expect((await gm.client.from("site_photos").insert({ slot: "gallery", gallery_group: "Dining", storage_path: path("gallery"), alt_text: "Plated dish" })).error).toBeNull();
    expect((await gm.client.from("site_photos").insert({ slot: "gallery", gallery_group: "Dining", storage_path: path("gallery"), alt_text: "Another dish" })).error).toBeNull();
  });

  it("photos need a description for screen readers", async () => {
    expect((await gm.client.from("site_photos").insert({ slot: "gallery", gallery_group: "Dining", storage_path: path("gallery"), alt_text: " " })).error).not.toBeNull();
    expect((await gm.client.from("room_category_images").insert({ category_id: categoryId, storage_path: path(categoryId), alt_text: "" })).error).not.toBeNull();
  });

  it("only one cover photo per room type", async () => {
    const tag = randomUUID().slice(0, 6);
    const { data: cat } = await admin.from("room_categories").insert({ slug: `ph-${tag}`, name: `Photo ${tag}`, nightly_rate_kobo: 100, max_occupancy: 1 }).select("id").single();
    expect((await gm.client.from("room_category_images").insert({ category_id: cat!.id, storage_path: path(cat!.id), alt_text: "First", is_cover: true })).error).toBeNull();
    expect((await gm.client.from("room_category_images").insert({ category_id: cat!.id, storage_path: path(cat!.id), alt_text: "Second", is_cover: true })).error).not.toBeNull();
  });

  it("adding and removing photos is audited with the manager's name", async () => {
    const { data: row } = await gm.client.from("room_category_images").insert({ category_id: categoryId, storage_path: path(categoryId), alt_text: "Audited photo" }).select("id").single();
    await gm.client.from("room_category_images").delete().eq("id", row!.id);
    const { data: log } = await admin.from("activity_log").select("action, actor_id").eq("entity_id", row!.id).order("id");
    expect(log).toEqual([{ action: "photo.added", actor_id: gm.id }, { action: "photo.removed", actor_id: gm.id }]);
  });
});

describe("deleting files", () => {
  it("managers can delete stored photos; front desk cannot", async () => {
    const p = path(categoryId);
    await gm.client.storage.from("room-images").upload(p, png, { contentType: "image/png" });
    const byDesk = await desk.client.storage.from("room-images").remove([p]);
    expect(byDesk.data ?? []).toHaveLength(0);
    const byGm = await gm.client.storage.from("room-images").remove([p]);
    expect(byGm.data).toHaveLength(1);
    const { data: left } = await admin.storage.from("room-images").list(categoryId, { search: p.split("/")[1] });
    expect(left ?? []).toHaveLength(0);
  });
});
