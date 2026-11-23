import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toActionError } from "./errors";

describe("toActionError", () => {
  it("shows our own validation messages but hides zod's technical ones", () => {
    expect(toActionError(z.string().max(2, "Keep the note short").safeParse("long").error).message).toBe("Keep the note short");
    expect(toActionError(z.uuid().safeParse("x").error).message).toBe("Check the details and try again.");
    expect(toActionError(z.number().safeParse("x").error).message).toBe("Check the details and try again.");
    expect(toActionError(new Error("db exploded")).message).toBe("Something went wrong. Please try again.");
  });
});
