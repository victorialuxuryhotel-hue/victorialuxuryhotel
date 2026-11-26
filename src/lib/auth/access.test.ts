import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { can, canAny } from "./permissions";

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [join(dir, e.name)] : []));

describe("staff access", () => {
  it("restaurant & bar and finance can't reach guest contacts or bookings work", () => {
    for (const role of ["restaurant_bar", "finance"] as const) {
      expect(can(role, "guests.manage")).toBe(false);
      expect(can(role, "reservations.manage")).toBe(false);
      expect(can(role, "rooms.status")).toBe(false);
    }
    expect(canAny("finance", ["payments.record", "reports.view"])).toBe(true);
    expect(canAny("restaurant_bar", ["payments.record", "reports.view"])).toBe(false);
  });

  it("every staff read names the permission it needs", () => {
    const bare = files("src/server").filter((f) => /authorizeRead\(\)/.test(readFileSync(f, "utf8")));
    expect(bare).toEqual([]);
  });

  it("every staff page under /app checks a permission or only redirects", () => {
    const pages = files("src/app/(management)/app").filter((f) => f.endsWith("page.tsx"));
    const open = pages.filter((f) => {
      const s = readFileSync(f, "utf8");
      // Account and This station are for every signed-in staff member (the staff layout requires sign-in).
      return !/can(Any)?\(staff\.role/.test(s) && !/redirect\(/.test(s) && !f.split(sep).some((part) => part === "account" || part === "station");
    });
    expect(open).toEqual([]);
  });
});
