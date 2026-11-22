import type { Metadata } from "next";
import { Suspense } from "react";
import { FrontDeskPayments } from "@/components/management/front-desk-payments";
import { PageHeader } from "@/components/management/page-header";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/management/pager";
import { PaymentTable } from "@/components/management/payments";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { allowedPaymentViews } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { frontDeskPayments, listPayments } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Payments" };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Content({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const requested = typeof sp.view === "string" ? sp.view : undefined;
  const page = pageFrom(sp.page);
  const reservationHref = (p: { reservationId?: string }) => `/app/reservations/${p.reservationId}`;

  // Front desk: the server limits the list to today's payments or their own.
  if (!allowedPaymentViews(staff.role).includes("all")) {
    const [{ view, rows }, summary] = await Promise.all([listPayments({ view: requested, size: 200 }), frontDeskPayments()]);
    return (
      <FrontDeskPayments
        view={view === "mine" ? "mine" : "today"}
        rows={rows.slice(0, 200)}
        summary={summary}
        staffId={staff.id}
        basePath="/app/payments"
        reservationHref={reservationHref}
      />
    );
  }

  const { rows: fetched } = await listPayments({ page, size: PAGE_SIZE });
  const rows = fetched.slice(0, PAGE_SIZE);
  return (
    <Card>
      {rows.length ? (
        <>
          <PaymentTable rows={rows} receiptHref={(n) => `/app/payments/receipt/${n}`} reservationHref={reservationHref} />
          <Pager basePath="/app/payments" params={{}} page={page} hasMore={fetched.length > PAGE_SIZE} />
        </>
      ) : (
        <div className="p-5"><EmptyState title="No payments yet" description="Payments will show here." /></div>
      )}
    </Card>
  );
}

export default function PaymentsPage(props: PageProps<"/app/payments">) {
  return (
    <>
      <PageHeader title="Payments" description="Online and desk payments." />
      <div className="px-4 py-6 lg:px-8">
        <Suspense fallback={<LoadingState />}>
          <Content searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}
