/**
 * The VAT rate to show on receipts, bills, the till and reports: the rate from Booking rules when
 * "Show VAT on receipts" is on, otherwise 0 (nothing shown). Off by default until the hotel confirms
 * it is VAT-registered (migration 0018). Select it as `${VAT_SHOWN_SQL} AS vat_rate_bp`.
 */
export const VAT_SHOWN_SQL = "CASE WHEN vat_on_receipts = 1 THEN vat_rate_bp ELSE 0 END";
