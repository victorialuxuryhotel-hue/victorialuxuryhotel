import { can, canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FrontDeskPayments } from "@/components/management/front-desk-payments";
import { PageHeader } from "@/components/management/page-header";
import Link from "next/link";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/management/pager";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { allowedPaymentViews } from "@/lib/auth/permissions";
import { requireStaff } from "@/server/auth";
import { frontDeskPayments, listPayments } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Payments" };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Content({ searchParams }: { searchParams: SP }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, ["payments.record", "reports.view"])) return <AccessDenied />;
  const sp = await searchParams;
  const requested = typeof sp.view === "string" ? sp.view : undefined;
  const page = pageFrom(sp.page);
  const reservationHref = (p: { reservationId?: string }) => `/app/reservations/${p.reservationId}`;

  const summary = can(staff.role, "payments.record") ? frontDeskPayments() : Promise.resolve(null);
  const confirmHref = canAny(staff.role, ["payments.approve", "reports.view"]) ? "/app/payments/confirm" : undefined;

  if (!allowedPaymentViews(staff.role).includes("all")) {
    const [{ view, rows }, totals] = await Promise.all([listPayments({ view: requested, size: 200 }), summary]);
    return (
      <FrontDeskPayments
        view={view === "mine" ? "mine" : "today"}
        rows={rows.slice(0, 200)}
        summary={totals}
        staffId={staff.id}
        basePath="/app/payments"
        reservationHref={reservationHref}
        confirmHref={confirmHref}
      />
    );
  }

  const [{ rows: fetched }, totals] = await Promise.all([listPayments({ page, size: PAGE_SIZE }), summary]);
  return (
    <FrontDeskPayments
      view="all"
      rows={fetched.slice(0, PAGE_SIZE)}
      summary={totals}
      staffId={staff.id}
      basePath="/app/payments"
      reservationHref={reservationHref}
      confirmHref={confirmHref}
      pager={<Pager basePath="/app/payments" params={{}} page={page} hasMore={fetched.length > PAGE_SIZE} />}
    />
  );
}

async function RecordButton() {
  const staff = await requireStaff();
  if (!can(staff.role, "payments.record")) return null;
  return <Link href="/app/payments/record" className={buttonStyles()}>Record a payment</Link>;
}

export default function PaymentsPage(props: PageProps<"/app/payments">) {
  return (
    <>
      <PageHeader title="Payments" description="Online and desk payments" actions={<Suspense fallback={null}><RecordButton /></Suspense>} />
      <div className="px-4 py-5 lg:px-7">
        <Suspense fallback={<LoadingState />}>
          <Content searchParams={props.searchParams} />
        </Suspense>
      </div>
    </>
  );
}
