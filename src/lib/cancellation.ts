export function cancellationRuleText(freeHours: number, feePct: number, checkInTime = "14:00"): string {
  const refunds = "Refunds go back to the original payment method.";
  if (feePct === 0) return `Free cancellation up to check-in. ${refunds}`;
  const hours = `${freeHours} hours before check-in`;
  return [
    `Free cancellation up to ${hours} (check-in is from ${checkInTime.slice(0, 5)}).`,
    `Within ${freeHours} hours of check-in, or if you don't arrive, ${feePct}% of the room price is charged. Extras you didn't use are refunded in full.`,
    `You can change your dates for free up to ${hours}, if rooms are available.`,
    refunds,
  ].join(" ");
}

export function lateFeeKobo(roomKobo: number, feePct: number): number {
  return Math.round((roomKobo * feePct) / 100);
}
