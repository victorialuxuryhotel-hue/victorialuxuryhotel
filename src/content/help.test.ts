import { describe, expect, it } from "vitest";
import { managementNav } from "@/components/management/nav-items";
import { firstDay, helpFor, screenHelp } from "./help";

// docs/glossary.md: the words staff screens don't use.
const NOT = /\b(reservations?|category|categories|balance|outstanding|transaction|folio|settled|ticket|add-ons?|customer id)\b/i;

describe("help on each screen (I10)", () => {
  it("every screen in the menu has a purpose line and 3–5 steps for its main task", () => {
    for (const { href } of managementNav) {
      const h = helpFor(href);
      expect(h, href).not.toBeNull();
      expect(h!.purpose.length, href).toBeGreaterThan(20);
      expect(h!.steps.length, href).toBeGreaterThanOrEqual(3);
      expect(h!.steps.length, href).toBeLessThanOrEqual(5);
    }
  });

  it("uses the glossary's words", () => {
    const text = Object.values(screenHelp).flatMap((h) => [h.purpose, h.task, ...h.steps]);
    const items = Object.values(firstDay).flatMap((l) => l!.flatMap((i) => [i.label, i.how]));
    expect([...text, ...items].filter((t) => NOT.test(t))).toEqual([]);
  });

  it("matches pages with an id", () => {
    expect(helpFor("/app/reservations/3f0e6a2b-1111-4000-8000-000000000000")?.task).toBe("Move a booking on");
    expect(helpFor("/app/nowhere")).toBeNull();
  });

  it("first-day lists for the front desk and the bar", () => {
    expect(firstDay.front_desk!.map((i) => i.label)).toEqual(["Take a walk-in", "Take a payment", "Check a guest in", "Check a guest out", "Mark a room clean"]);
    expect(firstDay.restaurant_bar!.map((i) => i.label)).toEqual(["Take an order", "Take a cash sale", "Take a transfer with its reference", "Close your day"]);
  });
});
