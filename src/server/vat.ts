/**
 * The VAT rate to show on receipts, bills, the till and reports: the rate from Booking rules when
 * "Show VAT on receipts" is on, otherwise 0 (nothing shown). Off by default until the hotel confirms
 * it is VAT-registered and its Tax ID (TIN) is entered (migrations 0018, 0019; the database refuses VAT
 * without a TIN). Select it as `${VAT_SHOWN_SQL} AS vat_rate_bp`, with `tax_id` to print the TIN.
 */
export const VAT_SHOWN_SQL = "CASE WHEN vat_on_receipts = 1 THEN vat_rate_bp ELSE 0 END";
