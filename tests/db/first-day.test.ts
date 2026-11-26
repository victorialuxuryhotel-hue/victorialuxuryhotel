// Interface brief I10: "Your first day" ticks, per staff member, only their role's jobs.
import { describe, expect, it } from "vitest";
import { firstDayTicks, setFirstDayTick } from "@/server/domain/first-day";
import { desk, gm, rejects, db } from "./helpers";

describe("your first day", () => {
  it("ticks and unticks the front desk's own jobs; nothing outside the list", async () => {
    await setFirstDayTick(db, desk, "walk_in", true);
    await setFirstDayTick(db, desk, "walk_in", true); // twice is fine
    expect(await firstDayTicks(db, desk)).toContain("walk_in");
    await setFirstDayTick(db, desk, "walk_in", false);
    expect(await firstDayTicks(db, desk)).not.toContain("walk_in");
    await rejects(setFirstDayTick(db, desk, "close_day", true), /isn't on your first-day list/); // a bar job
    await rejects(setFirstDayTick(db, gm, "walk_in", true), /isn't on your first-day list/); // no list for managers
  });
});
