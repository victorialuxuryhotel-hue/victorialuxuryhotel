import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, toActionError } from "./errors";
import { logger } from "./logger";

describe("toActionError", () => {
  it("shows our own validation messages but hides zod's technical ones", () => {
    expect(toActionError(z.string().max(2, "Keep the note short").safeParse("long").error).message).toBe("Keep the note short");
    expect(toActionError(z.uuid().safeParse("x").error).message).toBe("Check the details and try again.");
    expect(toActionError(z.number().safeParse("x").error).message).toBe("Check the details and try again.");
    expect(toActionError(new Error("db exploded")).message).toMatch(/^Something went wrong\. Try again\. If it happens again, contact support and quote Ref [A-HJ-NP-Z2-9]{4}\.$/);
  });

  it("gives an unexpected failure one reference code, the same in the log and on screen", () => {
    const err = new Error("db exploded");
    const lines: string[] = [];
    const original = console.error;
    console.error = (line: string) => lines.push(line);
    try {
      logger.error("thing_failed", err);
    } finally {
      console.error = original;
    }
    const logged = JSON.parse(lines[0]!).ref as string;
    expect(logged).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(toActionError(err).message).toContain(`Ref ${logged}.`);
    expect(toActionError(new AppError("INTERNAL", "The photo couldn't be uploaded. Please try again.")).message).toMatch(/^The photo couldn't be uploaded\. Try again\. If it happens again, contact support and quote Ref \w{4}\.$/);
    expect(toActionError(new AppError("CONFLICT", "The hall is already booked at that time.")).message).toBe("The hall is already booked at that time.");
  });
});
