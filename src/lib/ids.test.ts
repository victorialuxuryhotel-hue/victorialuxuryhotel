import { describe, expect, it } from "vitest";
import { recordId } from "./ids";

describe("recordId", () => {
  it("accepts starter room ids that z.uuid() rejects, and rejects junk", () => {
    expect(recordId().safeParse("06e13750-7784-4e06-e0c0-7d14e38c9b74").success).toBe(true);
    expect(recordId().safeParse(crypto.randomUUID()).success).toBe(true);
    expect(recordId().safeParse("101").success).toBe(false);
    expect(recordId().safeParse("06e13750-7784-4e06-e0c0-7d14e38c9b74' OR 1").success).toBe(false);
  });
});
