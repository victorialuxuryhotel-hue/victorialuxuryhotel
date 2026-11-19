import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/management/page-header";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/management/pager";
import { PaymentTable } from "@/components/management/payments";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { requireStaff } from "@/server/auth";
import { listPayments } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Payments" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const page = pageFrom((await searchParams).page);
  const fetched = await listPayments(page, PAGE_SIZE);
  const rows = fetched.slice(0, PAGE_SIZE);
  return (
    <Card>
      {rows.length ? (
        <>
          <PaymentTable rows={rows} receiptHref={(n) => `/app/payments/receipt/${n}`} />
          <Pager basePath="/app/payments" params={{}} page={page} hasMore={fetched.length > PAGE_SIZE} />
        </>
      ) : (
        <div className="p-5"><EmptyState title="No payments yet" description="Verified Paystack payments and recorded offline payments will appear here." /></div>
      )}
    </Card>
  );
}

export default function PaymentsPage(props: PageProps<"/app/payments">) {
  return (
    <>
      <PageHeader title="Payments" description="Every payment against a reservation, online and offline." />
      <div className="px-4 py-6 lg:px-8"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
