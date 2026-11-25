import { stayTimesSentence } from "@/lib/stay-times";
import { connection } from "next/server";
import { hotel } from "@/config/hotel";
import { facilities } from "@/content/site";
import { formatNaira } from "@/lib/format";
import { ALTERNATE_NAMES, SITE_URL } from "@/lib/seo";
import { publicBookingRules } from "@/server/queries/booking";
import { getPublicCategories } from "@/server/queries/catalogue";

export async function GET() {
  await connection();
  const [rooms, rules] = await Promise.all([getPublicCategories().catch(() => []), publicBookingRules().catch(() => null)]);
  const lines = [
    `# ${hotel.name}`,
    "",
    `> Hotel in Alagbaka GRA, Akure, Ondo State, Nigeria. Also known as ${ALTERNATE_NAMES.join(", ")}. Rooms, suites and apartments with an indoor pool, spa, restaurant, lounge and bar, and a club. Book direct at ${SITE_URL}/book.`,
    "",
    "## Contact",
    `- Address: ${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.state}, Nigeria`,
    `- Phone and WhatsApp: ${hotel.phoneDisplay}`,
    `- Email: ${hotel.email}`,
    `- Map: ${hotel.mapsUrl}`,
    "",
    "## Rooms (price per night, Nigerian naira, VAT included)",
    ...rooms.map((r) => `- [${r.name}](${SITE_URL}/rooms/${r.slug}): sleeps ${r.maxOccupancy}, ${formatNaira(r.fromRateKobo)}`),
    "",
    "## Facilities",
    ...facilities.map((f) => `- ${f.name}: ${f.text}`),
    "",
    "## Stay details",
    ...(rules ? [`- ${stayTimesSentence(rules.checkInTime, rules.checkOutTime)}`] : []),
    ...(rules?.cancellationPolicy ? [`- Cancellation: ${rules.cancellationPolicy}`] : []),
    "- Payment: online by card or bank transfer (Paystack), or at the front desk by cash, transfer or POS",
    "",
    "## Pages",
    `- [Rooms](${SITE_URL}/rooms)`,
    `- [Facilities](${SITE_URL}/facilities)`,
    `- [Gallery](${SITE_URL}/gallery)`,
    `- [About](${SITE_URL}/about)`,
    `- [Contact](${SITE_URL}/contact)`,
    `- [Book](${SITE_URL}/book)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
