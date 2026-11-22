import { describe, expect, it } from "vitest";
import { managerToAsk, touchLastSeen } from "@/server/domain/admin";
import { addDays, hotelToday } from "@/lib/hotel-date";
import { db, desk, exec, gm, q1, rejects } from "./helpers";

/** 5e: front desk is pointed at a manager to ask, preferring the general manager seen most recently. */
describe("manager to ask", () => {
  it("names the most recently seen general manager, active today, with their phone", async () => {
    await exec("UPDATE staff_profiles SET phone = ? WHERE id = ?", "+234 803 000 0000", gm.id);
    await touchLastSeen(db, gm.id, new Date(Date.now() + 60_000).toISOString());
    const m = await managerToAsk(db, desk, hotelToday());
    expect(m).toMatchObject({ name: "Dev Manager", role: "general_manager", phone: "+234 803 000 0000", activeToday: true });
  });

  it("is not 'active today' when last seen on an earlier Lagos day", async () => {
    await touchLastSeen(db, gm.id, new Date(Date.now() + 60_000).toISOString());
    const m = await managerToAsk(db, desk, addDays(hotelToday(), 1));
    expect(m?.activeToday).toBe(false);
  });

  it("does not record last seen for a deactivated account", async () => {
    const id = crypto.randomUUID();
    await exec("INSERT INTO staff_profiles (id, full_name, email, role, is_active) VALUES (?, 'Gone GM', ?, 'general_manager', 0)", id, `gone-${id.slice(0, 8)}@example.com`);
    await touchLastSeen(db, id);
    expect((await q1<{ last_seen_at: string | null }>("SELECT last_seen_at FROM staff_profiles WHERE id = ?", id)).last_seen_at).toBeNull();
  });

  it("needs a signed-in staff member", async () => {
    await rejects(managerToAsk(db, { id: crypto.randomUUID(), role: "guest" as never }, hotelToday()), /./);
  });
});
