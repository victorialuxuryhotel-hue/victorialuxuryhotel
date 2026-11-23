import { connection } from "next/server";
import { hotelJsonLd, ldJson } from "@/lib/seo";
import { getPublicCategories } from "@/server/queries/catalogue";
import { publicBookingRules } from "@/server/queries/booking";

export async function HotelSchema() {
  await connection();
  const data = await Promise.all([getPublicCategories(), publicBookingRules()]).catch(() => null);
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(hotelJsonLd(data[0], data[1])) }} />;
}
