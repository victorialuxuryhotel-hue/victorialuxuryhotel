import { Printer } from "lucide-react";
import { PageHeader } from "@/components/management/page-header";
import { Receipt } from "@/components/management/payments";
import { Button } from "@/components/ui/button";
import { reservationDetail } from "../../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Receipt" actions={<Button variant="secondary"><Printer className="size-4" aria-hidden />Print</Button>} />
      <div className="px-4 py-8 lg:px-8"><Receipt payment={reservationDetail.payments[0]!} reservation={reservationDetail} /></div>
    </>
  );
}
