import { isAnyTime } from "./stay-times";

export function cancellationRuleText(freeHours: number, feePct: number, checkInTime = "00:00"): string {
  const refunds = "Refunds go back to the original payment method.";
  if (feePct === 0) return `Free cancellation up to check-in. ${refunds}`;
  // With check-in any time, the window counts back from the start (midnight) of the arrival day.
  const start = isAnyTime(checkInTime) ? "your arrival day" : "check-in";
  const hours = `${freeHours} hours before ${start}`;
  return [
    isAnyTime(checkInTime)
      ? `Free cancellation up to ${hours} begins (midnight, Nigerian time).`
      : `Free cancellation up to ${hours} (check-in is from ${checkInTime.slice(0, 5)}).`,
    `After that, ${feePct}% of the room price is charged. Extras you didn't use are refunded in full.`,
    `You can change your dates for free up to ${hours}, if rooms are available.`,
    refunds,
  ].join(" ");
}

export function lateFeeKobo(roomKobo: number, feePct: number): number {
  return Math.round((roomKobo * feePct) / 100);
}
