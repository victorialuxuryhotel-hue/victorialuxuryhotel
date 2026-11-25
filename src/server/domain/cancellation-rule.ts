import { hotelInstant } from "@/lib/hotel-date";
import { first, type Db } from "../db";

export type CancelRule = { checkInTime: string; freeHours: number; feePct: number };

export async function cancelRule(db: Db): Promise<CancelRule> {
  const s = await first<{ check_in_time: string; free_cancel_hours: number; late_cancel_fee_pct: number }>(
    db,
    "SELECT check_in_time, free_cancel_hours, late_cancel_fee_pct FROM hotel_settings WHERE id = 1",
  );
  return { checkInTime: s?.check_in_time ?? "14:00", freeHours: s?.free_cancel_hours ?? 24, feePct: s?.late_cancel_fee_pct ?? 50 };
}

/** The share of the room total kept when cancelling inside the late window (0 outside it). */
export function cancellationFee(roomTotalKobo: number, checkIn: string, rule: CancelRule, at = Date.now()): number {
  const hoursBefore = (Date.parse(hotelInstant(checkIn, rule.checkInTime)) - at) / 3_600_000;
  return hoursBefore > rule.freeHours ? 0 : Math.round((roomTotalKobo * rule.feePct) / 100);
}
