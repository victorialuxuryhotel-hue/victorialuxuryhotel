import type { RoomBoardState, RoomReadiness } from "./status";

/** What the board knows about a room and the stays touching it today. */
export type BoardInput = {
  serviceStatus: "in_service" | "maintenance";
  readiness: RoomReadiness;
  /** A booking checked in to this room (whatever its dates). */
  inHouse?: { checkOut: string } | null;
  /** A booking arriving into this room today, not checked in yet. */
  arrivingToday?: boolean;
};

/**
 * One status per room, from what was recorded, never from dates alone (docs/rules-and-edge-cases.md, 2.2).
 * Priority: Out of order → Occupied (due out / overdue) → To clean → Arriving → Ready.
 */
export function boardState(room: BoardInput, today: string): { state: RoomBoardState; due?: "today" | "overdue" } {
  if (room.serviceStatus === "maintenance") return { state: "maintenance" };
  if (room.inHouse) {
    const due = room.inHouse.checkOut < today ? "overdue" : room.inHouse.checkOut === today ? "today" : undefined;
    return { state: "occupied", due };
  }
  if (room.readiness !== "ready") return { state: "dirty" };
  if (room.arrivingToday) return { state: "arriving" };
  return { state: "available" };
}

/** "Rao" from "Grace Rao": the board shows surnames to keep tiles short. */
export const surname = (fullName: string) => fullName.trim().split(/\s+/).at(-1) ?? fullName;
