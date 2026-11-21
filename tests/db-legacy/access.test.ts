import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, makeUser, refused, type TestUser } from "./api-helpers";

/**
 * Row Level Security and grants, exercised through the real Supabase API as
 * each kind of caller. These are the guarantees the app relies on: hiding a
 * button in the UI is never the protection.
 */

let owner: TestUser, gm: TestUser, desk: TestUser, inactive: TestUser, outsider: TestUser;
let categoryId: string, roomId: string, reservationId: string;

beforeAll(async () => {
  [owner, gm, desk, inactive, outsider] = await Promise.all([
    makeUser("owner"),
    makeUser("general_manager"),
    makeUser("front_desk"),
    makeUser("front_desk", { active: false }),
    makeUser(null), // valid auth account, but not staff
  ]);

  const { data: cat } = await admin.from("room_categories").select("id").eq("slug", "standard").single();
  categoryId = cat!.id;
  const { data: room } = await admin.from("rooms").select("id").eq("category_id", categoryId).limit(1).single();
  roomId = room!.id;
  const { data: guest } = await admin.from("guests").insert({ full_name: "Access Test Guest" }).select("id").single();
  const { data: res, error } = await admin
    .from("reservations")
    .insert({
      guest_id: guest!.id, category_id: categoryId, check_in: "2032-01-01", check_out: "2032-01-02",
      guest_count: 1, nightly_rate_kobo: 1_000_000, total_amount_kobo: 1_000_000, status: "confirmed", source: "phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  reservationId = res!.id;
  await admin.from("payments").insert({ reservation_id: reservationId, amount_kobo: 1_000_000, provider: "paystack", provider_reference: `acc-${reservationId}` });
  await admin.from("activity_log").insert({ actor_type: "system", action: "test.access", entity_type: "test", summary: "fixture" });
});

describe("website visitor (anon)", () => {
  it("can read active room categories and hotel settings", async () => {
    const c = anon();
    const { data } = await c.from("room_categories").select("slug");
    expect(data?.length).toBeGreaterThan(0);
    const { data: settings } = await c.from("hotel_settings").select("check_in_time");
    expect(settings).toHaveLength(1);
  });

  it("cannot see inactive categories", async () => {
    const { data: hidden } = await admin.from("room_categories").insert({ slug: `hidden-${Date.now()}`, name: `Hidden ${Date.now()}`, nightly_rate_kobo: 100, max_occupancy: 1, is_active: false }).select("id").single();
    const { data } = await anon().from("room_categories").select("id").eq("id", hidden!.id);
    expect(data).toEqual([]);
  });

  it.each(["rooms", "guests", "reservations", "payments", "staff_profiles", "activity_log", "payment_events", "reservation_status_history"] as const)(
    "cannot read %s",
    async (table) => {
      const { data } = await anon().from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    },
  );

  it("cannot write anything", async () => {
    const c = anon();
    expect(refused(await c.from("room_categories").insert({ slug: "x", name: "X", nightly_rate_kobo: 1, max_occupancy: 1 }).select())).toBe(true);
    expect(refused(await c.from("guests").insert({ full_name: "Intruder" }).select())).toBe(true);
    expect(refused(await c.from("room_categories").update({ nightly_rate_kobo: 1 }).eq("id", categoryId).select())).toBe(true);
  });

  it("cannot sign up for an account", async () => {
    const { error } = await anon().auth.signUp({ email: `walkin-${Date.now()}@victoria.test`, password: "whatever-123" });
    expect(error).not.toBeNull();
  });
});

describe("signed-in accounts that are not active staff", () => {
  it.each([["non-staff user", () => outsider], ["deactivated staff", () => inactive]] as const)("%s sees no operational data", async (_, who) => {
    const c = who().client;
    for (const table of ["rooms", "guests", "reservations", "payments"] as const) {
      const { data } = await c.from(table).select("id").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const { data: isStaff } = await c.rpc("is_staff");
    expect(isStaff).toBe(false);
  });
});

describe("front desk", () => {
  it("reads rooms, guests, reservations and payments", async () => {
    for (const table of ["rooms", "guests", "reservations", "payments"] as const) {
      const { data, error } = await desk.client.from(table).select("id").limit(1);
      expect(error).toBeNull();
      expect(data!.length).toBe(1);
    }
  });

  it("creates and updates guests", async () => {
    const { data, error } = await desk.client.from("guests").insert({ full_name: "Walk-in Guest" }).select("id").single();
    expect(error).toBeNull();
    const upd = await desk.client.from("guests").update({ phone: "+2348000000000" }).eq("id", data!.id).select();
    expect(upd.data).toHaveLength(1);
  });

  it("cannot write reservations or payments directly (only through business functions)", async () => {
    expect(refused(await desk.client.from("reservations").update({ status: "cancelled" }).eq("id", reservationId).select())).toBe(true);
    expect(refused(await desk.client.from("payments").insert({ reservation_id: reservationId, amount_kobo: 100, provider: "paystack", provider_reference: "forged" }).select())).toBe(true);
    const { data } = await admin.from("reservations").select("status").eq("id", reservationId).single();
    expect(data!.status).toBe("confirmed");
  });

  it("cannot change rates, categories, room configuration or settings", async () => {
    expect(refused(await desk.client.from("room_categories").update({ nightly_rate_kobo: 1 }).eq("id", categoryId).select())).toBe(true);
    expect(refused(await desk.client.from("rooms").update({ room_number: "X1" }).eq("id", roomId).select())).toBe(true);
    expect(refused(await desk.client.from("hotel_settings").update({ website_hold_minutes: 60 }).eq("id", true).select())).toBe(true);
  });

  it("cannot read the activity log, payment events or other staff profiles", async () => {
    expect((await desk.client.from("activity_log").select("id").limit(1)).data).toEqual([]);
    expect((await desk.client.from("payment_events").select("id").limit(1)).data).toEqual([]);
    const { data } = await desk.client.from("staff_profiles").select("id");
    expect(data!.map((r) => r.id)).toEqual([desk.id]);
  });

  it("cannot promote itself", async () => {
    expect(refused(await desk.client.from("staff_profiles").update({ role: "owner" }).eq("id", desk.id).select())).toBe(true);
    const { data } = await admin.from("staff_profiles").select("role").eq("id", desk.id).single();
    expect(data!.role).toBe("front_desk");
  });

  it("cannot write the activity log", async () => {
    expect(refused(await desk.client.from("activity_log").insert({ actor_type: "staff", action: "fake.entry", entity_type: "x", summary: "forged" }).select())).toBe(true);
  });
});

describe("general manager", () => {
  it("updates categories, rooms and settings", async () => {
    const { data: cat } = await gm.client.from("room_categories").update({ short_description: "Updated by GM" }).eq("id", categoryId).select();
    expect(cat).toHaveLength(1);
    const { data: room } = await gm.client.from("rooms").update({ floor: "1" }).eq("id", roomId).select();
    expect(room).toHaveLength(1);
    const { data: settings } = await gm.client.from("hotel_settings").update({ staff_hold_hours: 24 }).eq("id", true).select();
    expect(settings).toHaveLength(1);
  });

  it("reads the activity log and payment events", async () => {
    const { data, error } = await gm.client.from("activity_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("cannot manage staff", async () => {
    expect(refused(await gm.client.from("staff_profiles").update({ role: "front_desk" }).eq("id", owner.id).select())).toBe(true);
    expect(refused(await gm.client.from("staff_profiles").update({ is_active: false }).eq("id", desk.id).select())).toBe(true);
  });

  it("cannot delete categories (deactivate instead)", async () => {
    const { error } = await gm.client.from("room_categories").delete().eq("id", categoryId);
    expect(error).not.toBeNull();
  });
});

describe("owner", () => {
  it("changes staff roles and deactivates staff, and each change is audited", async () => {
    const target = await makeUser("front_desk");
    const { data } = await owner.client.from("staff_profiles").update({ role: "general_manager" }).eq("id", target.id).select();
    expect(data).toHaveLength(1);
    await owner.client.from("staff_profiles").update({ is_active: false }).eq("id", target.id);
    const { data: log } = await admin.from("activity_log").select("action, actor_id").eq("entity_id", target.id).order("id");
    expect(log!.map((l) => l.action)).toEqual(["staff.created", "staff.updated", "staff.updated"]);
    expect(log![1]!.actor_id).toBe(owner.id);
  });

  it("deactivated staff lose access immediately, even with a live session", async () => {
    const target = await makeUser("front_desk");
    expect((await target.client.from("rooms").select("id").limit(1)).data).toHaveLength(1);
    await owner.client.from("staff_profiles").update({ is_active: false }).eq("id", target.id);
    expect((await target.client.from("rooms").select("id").limit(1)).data).toEqual([]);
  });

  it("cannot remove the last active owner", async () => {
    // Temporarily deactivate every other owner so this one is the last; restore afterwards.
    const { data: others } = await admin.from("staff_profiles").select("id").eq("role", "owner").eq("is_active", true).neq("id", owner.id);
    const ids = (others ?? []).map((o) => o.id);
    if (ids.length) await admin.from("staff_profiles").update({ is_active: false }).in("id", ids);
    try {
      const { error } = await owner.client.from("staff_profiles").update({ role: "general_manager" }).eq("id", owner.id);
      expect(error?.message).toMatch(/At least one active owner/);
      const { error: e2 } = await owner.client.from("staff_profiles").update({ is_active: false }).eq("id", owner.id);
      expect(e2?.message).toMatch(/At least one active owner/);
    } finally {
      if (ids.length) await admin.from("staff_profiles").update({ is_active: true }).in("id", ids);
    }
  });
});
