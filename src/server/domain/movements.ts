// Who's arriving and leaving today, and how many have done it (interface brief I3). The lists on
// Today and the "13 of 18 arrived" headings use these same conditions, so a guest moves from the
// list to the done count and the total doesn't change. ?1 = first arrival date (tonight's business
// date, the same as ?2 after 06:00), ?2 = hotel date today.

import { first, type Db } from "../db";

const ARRIVING = "r.check_in BETWEEN ?1 AND ?2";
/** Still to arrive: on the Arriving list. */
export const DUE_IN_SQL = `${ARRIVING} AND r.status IN ('confirmed', 'pending_payment')`;
/** Arrived: checked in (or already gone again). Cancelled bookings and no-shows count in neither. */
export const ARRIVED_SQL = `${ARRIVING} AND r.status IN ('checked_in', 'checked_out')`;

const LEAVING = "r.check_out <= ?2";
/** Still to leave: on the Leaving list, overdue guests included. */
export const DUE_OUT_SQL = `${LEAVING} AND r.status = 'checked_in'`;
/** Left today. A guest leaving before their date wasn't on the list, so isn't counted. */
export const LEFT_SQL = `${LEAVING} AND r.status = 'checked_out' AND date(r.checked_out_at, '+1 hour') = ?2`;

export type MovementProgress = { arrived: number; left: number };

export async function movementProgress(db: Db, from: string, today: string): Promise<MovementProgress> {
  const row = await first<MovementProgress>(
    db,
    `SELECT (SELECT count(*) FROM reservations r WHERE ${ARRIVED_SQL}) AS arrived,
            (SELECT count(*) FROM reservations r WHERE ${LEFT_SQL}) AS left`,
    from,
    today,
  );
  return { arrived: row?.arrived ?? 0, left: row?.left ?? 0 };
}
