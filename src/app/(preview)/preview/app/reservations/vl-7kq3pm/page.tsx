import { Suspense } from "react";
import { ReservationDetailView } from "@/components/management/reservation-detail";
import { reservationDetail } from "../../../_sample";

type Props = { searchParams: Promise<{ paid?: string }> };

/** ?paid=RCT-… shows the after-payment banner (with Share on WhatsApp). */
export default function Page(props: Props) {
  return (
    <Suspense>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: Props) {
  const { paid } = await searchParams;
  return (
    <ReservationDetailView
      r={{ ...reservationDetail, publicToken: "sample-token" }}
      paidReceipt={paid}
      backHref="/preview/app/reservations"
      paymentsHref="/preview/app/payments/record"
      receiptHref={() => "/preview/app/payments/receipt"}
      today="2026-12-01"
      maxGuests={2}
      rooms={[{ id: "r201", number: "201", category: "Deluxe", ready: true }, { id: "r206", number: "206", category: "Deluxe", ready: false }, { id: "r301", number: "301", category: "Suite", ready: true }]}
      canOverride
    />
  );
}
