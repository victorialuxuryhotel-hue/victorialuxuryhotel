import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Room types | Website photos (design R302): tabs switch what the page shows; each is its own address. */
export function RatesTabs({ current }: { current: "types" | "photos" }) {
  const items = [
    { label: "Room types", href: "/app/rooms/categories", active: current === "types" },
    { label: "Website photos", href: "/app/rooms/categories/photos", active: current === "photos" },
  ];
  return (
    <nav aria-label="Rates & room types" className="mx-4 mt-4 flex gap-6 overflow-x-auto border-b border-hairline lg:mx-8">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-[3px] px-0.5 pb-2.5 text-[15px] font-semibold whitespace-nowrap",
            t.active ? "border-navy-900 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
