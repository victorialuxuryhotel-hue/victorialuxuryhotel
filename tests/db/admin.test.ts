import { describe, expect, it } from "vitest";
import {
  addCategoryPhoto,
  addSitePhoto,
  createFirstOwner,
  createRoom,
  createStaffProfile,
  deleteCategoryPhoto,
  deleteSitePhoto,
  linkClerkUser,
  saveCategory,
  setCoverPhoto,
  updateBookingRules,
  promoteToOwner,
  updateStaffProfile,
} from "@/server/domain/admin";
import { updateGuest } from "@/server/domain/reservations";
import { db, desk, gm, makeCategory, makeGuest, owner, q, q1, rejects } from "./helpers";

/**
 * Role limits at the data layer (the app's authorize() checks the same matrix
 * first; this is the backstop that replaces Postgres row-level security).
 */

const category = (over: Partial<Parameters<typeof saveCategory>[2]> = {}) => ({
  name: `Cat ${crypto.randomUUID().slice(0, 6)}`,
  slug: `cat-${crypto.randomUUID().slice(0, 6)}`,
  shortDescription: null,
  description: null,
  amenities: ["Wi-Fi"],
  nightlyRateKobo: 5_000_000,
  maxOccupancy: 2,
  sortOrder: 0,
  isActive: true,
  ...over,
});

describe("front desk", () => {
  it("updates guest details", async () => {
    const g = await makeGuest();
    await updateGuest(db, desk, { guestId: g, fullName: "Renamed Guest", phone: "+2348000000003", email: null, notes: "Prefers quiet room" });
    expect((await q1<{ full_name: string }>("SELECT full_name FROM guests WHERE id = ?", g)).full_name).toBe("Renamed Guest");
  });

  it("cannot change rates, room types, rooms, photos, settings or staff", async () => {
    const c = await makeCategory(1);
    await rejects(saveCategory(db, desk, category()), /role does not allow/, "FORBIDDEN");
    await rejects(createRoom(db, desk, { roomNumber: "X1", categoryId: c.id, floor: null }), /role does not allow/);
    await rejects(addCategoryPhoto(db, desk, { categoryId: c.id, storagePath: "x.jpg", altText: "A room" }), /role does not allow/);
    await rejects(updateBookingRules(db, desk, { checkInTime: "14:00", checkOutTime: "12:00", websiteHoldMinutes: 30, staffHoldHours: 24, cancellationPolicy: null }), /role does not allow/);
    await rejects(createStaffProfile(db, desk, { fullName: "New Person", email: "new@example.com", role: "owner" }), /role does not allow/);
    await rejects(updateStaffProfile(db, desk, { staffId: desk!.id, role: "owner", isActive: true }), /role does not allow/);
  });
});

describe("general manager", () => {
  it("manages room types, rooms and booking rules, each audited with their name", async () => {
    const id = await saveCategory(db, gm, category({ nightlyRateKobo: 4_000_000 }));
    await saveCategory(db, gm, { ...category(), id, nightlyRateKobo: 4_500_000 });
    await createRoom(db, gm, { roomNumber: `G${crypto.randomUUID().slice(0, 5)}`, categoryId: id, floor: "1" });
    await updateBookingRules(db, gm, { checkInTime: "15:00:00", checkOutTime: "11:00", websiteHoldMinutes: 45, staffHoldHours: 12, cancellationPolicy: "Free cancellation up to 48 hours before arrival." });
    const s = await q1<{ check_in_time: string; website_hold_minutes: number }>("SELECT check_in_time, website_hold_minutes FROM hotel_settings");
    expect(s).toEqual({ check_in_time: "15:00", website_hold_minutes: 45 });
    const logs = await q<{ action: string; actor_id: string }>(
      "SELECT action, actor_id FROM activity_log WHERE action IN ('category.created', 'category.updated', 'room.created', 'settings.updated') ORDER BY id DESC LIMIT 4",
    );
    expect(logs.map((l) => l.action).sort()).toEqual(["category.created", "category.updated", "room.created", "settings.updated"]);
    expect(new Set(logs.map((l) => l.actor_id))).toEqual(new Set([gm!.id]));
    await updateBookingRules(db, gm, { checkInTime: "14:00", checkOutTime: "12:00", websiteHoldMinutes: 30, staffHoldHours: 24, cancellationPolicy: null });
  });

  it("gets a clear message for a duplicate room type or room number", async () => {
    const c = await makeCategory(0);
    const slug = (await q1<{ slug: string }>("SELECT slug FROM room_categories WHERE id = ?", c.id)).slug;
    await rejects(saveCategory(db, gm, category({ slug })), /already exists/, "CONFLICT");
    const n = `D${crypto.randomUUID().slice(0, 5)}`;
    await createRoom(db, gm, { roomNumber: n, categoryId: c.id, floor: null });
    await rejects(createRoom(db, gm, { roomNumber: n, categoryId: c.id, floor: null }), /already exists/, "CONFLICT");
  });

  it("cannot manage staff", async () => {
    await rejects(createStaffProfile(db, gm, { fullName: "New Person", email: "gm-new@example.com", role: "front_desk" }), /role does not allow/);
  });
});

describe("photo records", () => {
  it("first room photo is the cover; one cover per room type; next becomes cover on delete", async () => {
    const c = await makeCategory(0);
    await addCategoryPhoto(db, gm, { categoryId: c.id, storagePath: `rooms/${c.id}/a.jpg`, altText: "Bedroom with view" });
    await addCategoryPhoto(db, gm, { categoryId: c.id, storagePath: `rooms/${c.id}/b.jpg`, altText: "Bathroom" });
    const photos = await q<{ id: string; is_cover: number; sort_order: number }>("SELECT id, is_cover, sort_order FROM room_category_images WHERE category_id = ? ORDER BY sort_order", c.id);
    expect(photos.map((p) => [p.sort_order, p.is_cover])).toEqual([[0, 1], [1, 0]]);
    await setCoverPhoto(db, gm, photos[1]!.id);
    expect((await q("SELECT 1 FROM room_category_images WHERE category_id = ? AND is_cover = 1", c.id))).toHaveLength(1);
    expect(await deleteCategoryPhoto(db, gm, photos[1]!.id)).toBe(`rooms/${c.id}/b.jpg`);
    expect((await q1<{ is_cover: number }>("SELECT is_cover FROM room_category_images WHERE id = ?", photos[0]!.id)).is_cover).toBe(1);
  });

  it("each website place holds one photo (replacing returns the old file); the gallery holds many", async () => {
    const first = await addSitePhoto(db, gm, { slot: "spa", galleryGroup: null, storagePath: "site/spa/1.jpg", altText: "Spa treatment room" });
    expect(first).toBeNull();
    expect(await addSitePhoto(db, gm, { slot: "spa", galleryGroup: null, storagePath: "site/spa/2.jpg", altText: "Spa, new photo" })).toBe("site/spa/1.jpg");
    expect(await q("SELECT 1 FROM site_photos WHERE slot = 'spa'")).toHaveLength(1);
    await addSitePhoto(db, gm, { slot: "gallery", galleryGroup: "Dining", storagePath: "site/g/1.jpg", altText: "Dinner" });
    await addSitePhoto(db, gm, { slot: "gallery", galleryGroup: "Dining", storagePath: "site/g/2.jpg", altText: "Breakfast" });
    await rejects(addSitePhoto(db, gm, { slot: "gallery", galleryGroup: null, storagePath: "site/g/3.jpg", altText: "No section" }), /aren't valid/);
    const spa = await q1<{ id: string }>("SELECT id FROM site_photos WHERE slot = 'spa'");
    expect(await deleteSitePhoto(db, gm, spa.id)).toBe("site/spa/2.jpg");
  });

  it("photos need a description for screen readers, and changes are audited with the manager's name", async () => {
    const c = await makeCategory(0);
    await rejects(addCategoryPhoto(db, gm, { categoryId: c.id, storagePath: `rooms/${c.id}/x.jpg`, altText: "  " }), /aren't valid/);
    await addCategoryPhoto(db, gm, { categoryId: c.id, storagePath: `rooms/${c.id}/y.jpg`, altText: "Room" });
    const log = await q1<{ actor_id: string; action: string }>("SELECT actor_id, action FROM activity_log WHERE action = 'photo.added' ORDER BY id DESC LIMIT 1");
    expect(log).toEqual({ actor_id: gm!.id, action: "photo.added" });
  });
});

describe("owner and staff", () => {
  it("invites staff, changes roles and deactivates, each audited", async () => {
    const id = await createStaffProfile(db, owner, { fullName: "Ada Front", email: "Ada.Front@Example.com", role: "front_desk" });
    expect((await q1<{ email: string }>("SELECT email FROM staff_profiles WHERE id = ?", id)).email).toBe("ada.front@example.com");
    await updateStaffProfile(db, owner, { staffId: id, role: "general_manager", isActive: true });
    await updateStaffProfile(db, owner, { staffId: id, role: "general_manager", isActive: false });
    const logs = await q<{ action: string; actor_id: string }>("SELECT action, actor_id FROM activity_log WHERE entity_id = ? ORDER BY id", id);
    expect(logs.map((l) => l.action)).toEqual(["staff.created", "staff.updated", "staff.updated"]);
    expect(logs.every((l) => l.actor_id === owner!.id)).toBe(true);
    await rejects(createStaffProfile(db, owner, { fullName: "Dup", email: "ada.front@example.com", role: "front_desk" }), /already has an account/);
  });

  it("grants owner only through the separate Make owner step, logged", async () => {
    await rejects(createStaffProfile(db, owner, { fullName: "Want Owner", email: `own-${crypto.randomUUID().slice(0, 6)}@example.com`, role: "owner" }), /Make them owner afterwards/);
    const id = await createStaffProfile(db, owner, { fullName: "Next Owner", email: `next-${crypto.randomUUID().slice(0, 6)}@example.com`, role: "general_manager" });
    await rejects(updateStaffProfile(db, owner, { staffId: id, role: "owner", isActive: true }), /Make owner/);
    await rejects(promoteToOwner(db, gm, id), /role does not allow/);
    expect((await promoteToOwner(db, owner, id)).role).toBe("owner");
    // Once an owner, ordinary saves (e.g. a phone change) keep the role.
    await updateStaffProfile(db, owner, { staffId: id, role: "owner", isActive: true, phone: "+234 803 000 0000" });
    const logs = await q<{ action: string }>("SELECT action FROM activity_log WHERE entity_id = ? ORDER BY id", id);
    expect(logs.map((l) => l.action)).toEqual(["staff.created", "staff.updated"]);
    // Step back down so the shared database keeps its usual owners.
    await updateStaffProfile(db, owner, { staffId: id, role: "general_manager", isActive: false });
    await rejects(promoteToOwner(db, owner, id), /Restore their access/);
  });

  it("cannot remove the last active owner or deactivate themselves", async () => {
    await rejects(updateStaffProfile(db, owner, { staffId: owner!.id, role: "front_desk", isActive: true }), /at least one active owner/);
    await rejects(updateStaffProfile(db, owner, { staffId: owner!.id, role: "owner", isActive: false }), /can't deactivate your own/);
  });

  it("links a Clerk user to the invited record by email, once", async () => {
    const email = `link-${crypto.randomUUID().slice(0, 6)}@example.com`;
    await createStaffProfile(db, owner, { fullName: "Link Me", email, role: "front_desk" });
    const linked = await linkClerkUser(db, "user_clerk_1" + email, email.toUpperCase());
    expect(linked).toMatchObject({ email, role: "front_desk", is_active: 1 });
    // A second Clerk account with the same email can't take over the record.
    expect(await linkClerkUser(db, "user_clerk_2" + email, email)).toBeNull();
  });

  it("the first owner can only be created once (bootstrap)", async () => {
    await rejects(createFirstOwner(db, { fullName: "Another Owner", email: "boot@example.com" }), /owner already exists/);
  });
});
