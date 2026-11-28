import { canAny } from "@/lib/auth/permissions";
import { AccessDenied } from "@/components/management/access-denied";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestTable } from "@/components/management/guests";
import { PageHeader } from "@/components/management/page-header";
import { PAGE_SIZE, Pager, pageFrom } from "@/components/management/pager";
import { ListToolbar } from "@/components/management/toolbar";
import { Section } from "@/components/ui/card";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { requireStaff } from "@/server/auth";
import { listGuests } from "@/server/queries/guests";

export const metadata: Metadata = { title: "Guests" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  if (!canAny(staff.role, "guests.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const term = typeof sp.q === "string" ? sp.q : undefined;
  const page = pageFrom(sp.page);
  const fetched = await listGuests(term, page, PAGE_SIZE);
  const guests = fetched.slice(0, PAGE_SIZE);
  return (
    <div className="space-y-3.5">
      <ListToolbar placeholder="Name, phone or email" defaultQuery={term} />
      <Section title="Guests" count={page === 1 && fetched.length <= PAGE_SIZE ? guests.length : undefined}>
        {guests.length ? (
          <>
            <GuestTable rows={guests} hrefFor={(g) => `/app/guests/${g.id}`} />
            <Pager basePath="/app/guests" params={{ q: term }} page={page} hasMore={fetched.length > PAGE_SIZE} />
          </>
        ) : (
          <div className="p-5"><EmptyState title={term ? "No guests match your search" : "No guests yet"} description={term ? undefined : "Guests are added automatically when a booking is made."} /></div>
        )}
      </Section>
    </div>
  );
}

export default function GuestsPage(props: PageProps<"/app/guests">) {
  return (
    <>
      <PageHeader title="Guests" description="Contact details and stay history" />
      <div className="px-4 py-5 lg:px-7"><Suspense fallback={<LoadingState />}><Content searchParams={props.searchParams} /></Suspense></div>
    </>
  );
}
