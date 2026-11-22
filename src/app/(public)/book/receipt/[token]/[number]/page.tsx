import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Receipt } from "@/components/management/payments";
import { PrintButton } from "@/components/management/print-button";
import { Container } from "@/components/public/section";
import { getGuestReceipt } from "@/server/queries/booking";

export const metadata: Metadata = { title: "Your receipt", robots: { index: false, follow: false } };

/** The guest's printable receipt, linked from the payment email ("View or print receipt"). */
async function Content({ params }: { params: Promise<{ token: string; number: string }> }) {
  const { token, number } = await params;
  const data = await getGuestReceipt(token, number);
  if (!data) notFound();
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/book/confirmation/${token}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-600 hover:text-navy-800">
          <ArrowLeft className="size-4" aria-hidden /> Your booking
        </Link>
        <PrintButton />
      </div>
      <Receipt payment={data.payment} reservation={data.reservation} forGuest vatRateBp={data.vatRateBp} />
    </>
  );
}

export default function GuestReceiptPage(props: PageProps<"/book/receipt/[token]/[number]">) {
  return (
    <Container className="py-8 sm:py-12 print:p-0">
      <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-card bg-ivory-200" />}>
        <Content params={props.params} />
      </Suspense>
    </Container>
  );
}
