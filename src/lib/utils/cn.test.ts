import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("lets a later utility override an earlier conflicting one", () => {
    expect(cn("bg-navy-800 px-4", "bg-navy-950")).toBe("px-4 bg-navy-950");
    expect(cn("inline-flex", "hidden")).toBe("hidden");
  });
  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});
