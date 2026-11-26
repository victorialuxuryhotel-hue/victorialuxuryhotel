/**
 * The hotel's operating defaults: the [decide] items in docs/rules-and-edge-cases.md, section 7.
 * One place to change them. Values the hotel edits itself (check-in and check-out times,
 * holds, cancellation window and fee, VAT) live in Booking rules (hotel_settings) instead,
 * and are listed here so this file is the full index.
 */
export const policy = {
  /** 7.1 The business day runs from this hour (Africa/Lagos) to the same hour next day. Closings, "today" at the till and sales reports use it. */
  businessDayStartHour: 6,
  /** 7.2 Overstay: an extra night is due from check-out time plus this grace. No late check-out fee. */
  overstayGraceHours: 2,
  /** 7.3 No-show: the first night is kept and the rest refunded; the General Manager or Owner decides. */
  noShowKeepNights: 1,
  /** 7.5 No early check-in fee. Check-in time itself is in Booking rules (00:00 = any time on the arrival day). */
  earlyCheckInFeeKobo: 0,
  /** 7.6 Stock can't go below zero (decided 25 Nov: block). */
  stockBelowZero: "block" as const,
  /** 7.7 Shared laptops lock after this many idle minutes. */
  idleLockMinutes: 10,
  /** 7.8 One payer for several rooms: not supported; each booking is paid separately. */
  groupPayments: false,
  // 7.4 Early departure refunds: unused nights refunded on request, approved by the General Manager or Owner.
  // 7.9 VAT on receipts: off until the hotel's Tax ID (TIN) is confirmed; then enter the TIN and switch it on in Booking rules.
} as const;
