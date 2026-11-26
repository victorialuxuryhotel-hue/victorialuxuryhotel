import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import type { ReservationRow } from "@/domain/views";
import { CheckInButton, CheckOutButton } from "./reservation-actions";

/** The one thing staff should do next with a booking, or nothing when there is nothing to do yet. */
export function NextStep({ r, today, href }: { r: ReservationRow; today: string; href: string }) {
  const link = (label: string, variant: "primary" | "secondary" = "secondary") => (
    <Link href={href} className={buttonStyles({ variant, size: "sm", className: "h-10 shrink-0 whitespace-nowrap" })}>{label}</Link>
  );
  const action = (node: React.ReactNode) => <div className="shrink-0 [&_button]:h-10 [&_button]:text-sm [&_button]:whitespace-nowrap">{node}</div>;
  const balance = r.totalKobo - r.paidKobo;

  if (r.attention) return link("Review", "primary");
  if (r.status === "pending_payment") return link("Take payment");
  if (r.status === "confirmed") {
    if (r.checkIn <= today && r.checkOut > today && r.roomNumber) return action(<CheckInButton reservationId={r.id} roomNumber={r.roomNumber} />);
    if (!r.roomNumber && r.checkOut > today) return link("Assign room");
  }
  if (r.status === "checked_in") {
    if (r.checkOut <= today) return action(<CheckOutButton reservationId={r.id} balanceKobo={balance} size="sm" />);
    if (balance > 0) return link("Record payment");
  }
  return null;
}
