import { PageHeader } from "@/components/management/page-header";
import { ReservationForm } from "@/components/management/reservation-form";
import { categories } from "../../../_sample";

export default function Page() {
  return (
    <>
      <PageHeader title="New reservation" description="Walk-in, phone or WhatsApp. Uses the same availability and pricing as the website." />
      <ReservationForm categories={categories} today="2026-12-01" holdHours={24} />
    </>
  );
}
