import type { StaySearch } from "@/components/booking/booking-ui";
import { availability } from "../_sample";

export const search: StaySearch = { checkIn: "2026-12-12", checkOut: "2026-12-14", guests: 2 };
export const chosen = availability[1]!;
