import Link from "next/link";
import { PageHeader } from "@/components/management/page-header";
import { PaymentTable } from "@/components/management/payments";
import { FilterSelect, ListToolbar } from "@/components/management/toolbar";
import { buttonStyles } from "@/components/ui/button";
import { Card, Stat, StatGrid } from "@/components/ui/card";
import { paymentMethod, paymentStatus } from "@/domain/status";
import { formatNaira } from "@/lib/format";
import { payments } from "../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="Payments" description="Every payment against a reservation, online and offline." actions={<Link href="/preview/app/payments/record" className={buttonStyles({ variant: "secondary" })}>Record offline payment</Link>} />
      <div className="space-y-6 px-4 py-6 lg:px-8">
        <StatGrid className="xl:grid-cols-3">
          <Stat label="Received today" value={formatNaira(8_000_000)} caption="Verified payments only" />
          <Stat label="Received this month" value={formatNaira(48_650_000)} caption="Paystack + recorded offline" />
          <Stat label="Outstanding" value={formatNaira(12_850_000)} caption="Balances on confirmed stays" />
        </StatGrid>
        <Card>
          <ListToolbar
            placeholder="Search by reservation, receipt or reference"
            filters={<><FilterSelect name="status" label="Status" options={Object.entries(paymentStatus).map(([k, v]) => [k, v.label])} /><FilterSelect name="method" label="Method" options={Object.entries(paymentMethod)} /></>}
          />
          <PaymentTable rows={payments} receiptHref={() => "/preview/app/payments/receipt"} />
        </Card>
      </div>
    </>
  );
}
