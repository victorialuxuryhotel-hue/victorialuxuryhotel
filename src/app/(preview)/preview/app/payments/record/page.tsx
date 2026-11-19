import { PageHeader } from "@/components/management/page-header";
import { OfflinePaymentForm } from "@/components/management/offline-payment-form";
import { Card } from "@/components/ui/card";
import { reservations } from "../../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Record offline payment" description="Cash, bank transfer or POS received directly by the hotel." />
      <div className="px-4 py-6 lg:px-8"><Card className="mx-auto max-w-2xl p-6"><OfflinePaymentForm reservation={reservations[3]!} today="2026-12-01" /></Card></div>
    </>
  );
}
