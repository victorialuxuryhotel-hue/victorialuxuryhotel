import { Suspense } from "react";
import { FrontDeskPayments } from "@/components/management/front-desk-payments";
import { PageHeader } from "@/components/management/page-header";
import { payments } from "../../../_sample";

type Props = { searchParams: Promise<{ view?: string }> };

/** Payments as front desk sees them (5d). ?view=mine shows "Recorded by me". */
async function Content({ searchParams }: Props) {
  const view = (await searchParams).view === "mine" ? "mine" : "today";
  const rows = payments
    .filter((p) => p.status === "successful")
    .map((p, i) => ({ ...p, reservationId: "r1", at: p.paidAt ?? "2026-12-01T09:00:00Z", recordedById: i === 1 ? "me" : "someone", kind: "payment" as const }));
  return (
    <FrontDeskPayments
      view={view}
      rows={view === "mine" ? rows.filter((r) => r.recordedById === "me") : rows}
      summary={{ todayCount: rows.length, mineCount: 7, totals: { cash: 12_000_000, transfer: 4_500_000, cardOnline: 16_500_000, pos: 0, other: 0 } }}
      staffId="me"
      basePath="/preview/app/payments/front-desk"
      reservationHref={() => "/preview/app/reservations/vl-7kq3pm"}
    />
  );
}

export default function Page(props: Props) {
  return (
    <>
      <PageHeader title="Payments" description="Online and desk payments." />
      <div className="px-4 py-6 lg:px-8"><Suspense><Content {...props} /></Suspense></div>
    </>
  );
}
