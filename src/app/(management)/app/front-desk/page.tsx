import { redirect } from "next/navigation";

/** Front desk merged into Today (arrivals, departures and guests in house). */
export default function OldFrontDeskPage() {
  redirect("/app/today");
}
