import { describe, expect, it } from "vitest";
import { boardState, surname } from "./room-board";

const today = "2026-11-25";
const room = { serviceStatus: "in_service" as const, readiness: "ready" as const };

describe("room board status", () => {
  it("follows the spec's priority: out of order, occupied, to clean, arriving, ready", () => {
    expect(boardState({ ...room, serviceStatus: "maintenance", inHouse: { checkOut: "2026-11-27" } }, today).state).toBe("maintenance");
    expect(boardState({ ...room, readiness: "needs_cleaning", inHouse: { checkOut: "2026-11-27" } }, today).state).toBe("occupied");
    expect(boardState({ ...room, readiness: "needs_cleaning", arrivingToday: true }, today).state).toBe("dirty");
    expect(boardState({ ...room, arrivingToday: true }, today).state).toBe("arriving");
    expect(boardState(room, today).state).toBe("available");
  });

  it("a guest still checked in is occupied whatever the dates; due out today or overdue says so", () => {
    expect(boardState({ ...room, inHouse: { checkOut: "2026-11-22" } }, today)).toEqual({ state: "occupied", due: "overdue" });
    expect(boardState({ ...room, inHouse: { checkOut: today } }, today)).toEqual({ state: "occupied", due: "today" });
    expect(boardState({ ...room, inHouse: { checkOut: "2026-11-28" } }, today)).toEqual({ state: "occupied", due: undefined });
  });

  it("shows surnames", () => {
    expect(surname("Grace  Adeyemi")).toBe("Adeyemi");
    expect(surname("Madonna")).toBe("Madonna");
  });
});
