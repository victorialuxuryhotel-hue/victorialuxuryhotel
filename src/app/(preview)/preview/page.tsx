import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/public/section";

export const metadata: Metadata = { title: "Design preview", robots: { index: false, follow: false } };

const groups: Array<{ title: string; screens: Array<[string, string]> }> = [
  {
    title: "Website",
    screens: [["/", "Home"], ["/rooms", "Rooms"], ["/facilities", "Facilities"], ["/gallery", "Gallery"], ["/about", "About"], ["/contact", "Contact"], ["/book", "Book: search"]],
  },
  {
    title: "Guest booking journey",
    screens: [
      ["/preview/book/rooms", "1 · Choose a room"],
      ["/preview/book/details", "2 · Your details"],
      ["/preview/book/payment", "3 · Review & pay"],
      ["/preview/book/pending", "Payment being confirmed"],
      ["/preview/book/confirmed", "Booking confirmed"],
      ["/preview/book/failed", "Payment failed"],
    ],
  },
  {
    title: "Management",
    screens: [
      ["/login", "Staff sign in"],
      ["/preview/app", "Dashboard"],
      ["/preview/app/today", "Today: needs you now, arrivals, departures, in house"],
      ["/preview/app/reservations", "Reservations"],
      ["/preview/app/reservations/new", "New reservation"],
      ["/preview/app/reservations/vl-7kq3pm", "Reservation detail"],
      ["/preview/app/rooms", "Room board"],
      ["/preview/app/rooms/categories", "Room categories"],
      ["/preview/app/rooms/categories/standard", "Edit category"],
      ["/preview/app/guests", "Guests"],
      ["/preview/app/guests/g1", "Guest profile"],
      ["/preview/app/payments", "Payments"],
      ["/preview/app/payments/record", "Record offline payment"],
      ["/preview/app/payments/receipt", "Receipt"],
      ["/preview/app/settings", "Booking rules and activity log"],
    ],
  },
];

export default function PreviewIndex() {
  return (
    <main className="flex-1 bg-ivory-50 py-16">
      <Container>
        <h1 className="font-display text-5xl text-navy-950">All screens</h1>
        <p className="mt-2 text-ink-600">Every page in the platform. Preview screens use sample data.</p>
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {groups.map((g) => (
            <section key={g.title} className="rounded-card bg-ivory-50 p-6 shadow-card">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">{g.title}</h2>
              <ul className="mt-4 divide-y divide-hairline">
                {g.screens.map(([href, label]) => (
                  <li key={href}><Link href={href} className="block py-2.5 text-sm text-ink-800 hover:text-navy-700">{label}</Link></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </main>
  );
}
