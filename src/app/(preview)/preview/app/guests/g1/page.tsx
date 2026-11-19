import { GuestProfile } from "@/components/management/guests";
import { guests, reservations } from "../../../_sample";

export default function Page() {
  return <GuestProfile guest={guests[0]!} stays={[reservations[0]!, { ...reservations[4]!, guestName: "Adaeze Okafor" }]} stayHref={() => "/preview/app/reservations/vl-7kq3pm"} />;
}
