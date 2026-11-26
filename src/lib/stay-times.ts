// Check-in and check-out times as guests read them. The times live in Booking rules
// (hotel_settings); a check-in time of 00:00 means "any time on the arrival day".

export const isAnyTime = (t: string) => t.slice(0, 5) === "00:00";

/** "2:00 pm", "12:00 noon". */
export function timeLabel(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h === 12 && m === 0 ? "12:00 noon" : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

/** "any time" or "from 2:00 pm": reads after the date, e.g. "Thu 26 Nov, any time". */
export const checkInWhen = (t: string) => (isAnyTime(t) ? "any time" : `from ${timeLabel(t)}`);

/** "by 12:00 noon". */
export const checkOutWhen = (t: string) => `by ${timeLabel(t)}`;

/** One sentence for FAQs and summaries. */
export const stayTimesSentence = (checkIn: string, checkOut: string) =>
  `${isAnyTime(checkIn) ? "Check in any time on your arrival day" : `Check-in is from ${timeLabel(checkIn)}`}. Check-out is ${checkOutWhen(checkOut)}.`;
