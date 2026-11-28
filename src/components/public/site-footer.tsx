import Link from "next/link";
import { hotel } from "@/config/hotel";

const columns: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  { title: "STAY", links: [{ href: "/rooms", label: "Rooms" }, { href: "/facilities", label: "Facilities" }, { href: "/gallery", label: "Gallery" }] },
  { title: "HOTEL", links: [{ href: "/about", label: "About" }, { href: "/contact", label: "Contact" }, { href: "/account", label: "My booking" }] },
  {
    title: "CONTACT",
    links: [
      { href: `tel:${hotel.phone}`, label: hotel.phoneDisplay },
      { href: `mailto:${hotel.email}`, label: hotel.email },
      { href: `https://wa.me/${hotel.whatsapp}`, label: "WhatsApp" },
    ],
  },
];

const phoneLinks = [
  { href: "/rooms", label: "Rooms" },
  { href: "/facilities", label: "Facilities" },
  { href: "/contact", label: "Contact" },
  { href: "/account", label: "My booking" },
];

/** Design G1 (desktop: wordmark and address, then three columns) and M12 (phone: one row of links). */
export function SiteFooter() {
  const address = `${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}`;
  return (
    <footer className="mt-auto bg-[#0b1f5c] text-white">
      <div className="mx-auto grid max-w-360 gap-8 px-4 py-6 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:px-16 lg:py-12">
        <div>
          <p className="font-brand text-[28px] leading-tight text-white">Victoria Luxury</p>
          <a href={hotel.mapsUrl} className="mt-2 block max-w-80 text-sm text-[#d3d9ee] hover:text-white">
            <span className="lg:hidden">{hotel.address.line1}, {hotel.address.city}</span>
            <span className="hidden lg:inline">{address}</span>
          </a>
          <ul className="mt-1 flex flex-wrap gap-x-4 lg:hidden">
            {phoneLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center text-sm text-white">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        {columns.map((c) => (
          <div key={c.title} className="hidden lg:block">
            <p className="mb-1 text-[13px] font-semibold tracking-[0.08em] text-gold-400">{c.title}</p>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("/") ? (
                    <Link href={l.href} className="text-sm text-[#d3d9ee] hover:text-white">{l.label}</Link>
                  ) : (
                    <a href={l.href} className="text-sm break-all text-[#d3d9ee] hover:text-white">{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
