import { publicEnv } from "@/lib/env";
import { stayIcs } from "@/lib/ics";
import { getBookingByToken, publicBookingRules } from "@/server/queries/booking";

export async function GET(_req: Request, ctx: RouteContext<"/book/confirmation/[token]/calendar">) {
  const { token } = await ctx.params;
  const b = await getBookingByToken(token);
  if (!b || !["confirmed", "checked_in", "checked_out"].includes(b.status)) return new Response("Not found", { status: 404 });
  const rules = await publicBookingRules();
  const body = stayIcs({
    reference: b.reference, category: b.category.name, checkIn: b.check_in, checkOut: b.check_out,
    checkInTime: rules.checkInTime, checkOutTime: rules.checkOutTime, url: `${publicEnv().NEXT_PUBLIC_SITE_URL}/book/confirmation/${token}`,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="victoria-luxury-${b.reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
