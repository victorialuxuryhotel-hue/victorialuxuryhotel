import { connection } from "next/server";
import { getDb } from "@/server/db";
import { guestEmail } from "@/server/guest-account";
import { AccountMenu, MyBookingLink } from "./account-menu";

/** Signed-in guests see their first name with a menu (design D4); everyone else sees "My booking". */
export async function GuestMenu() {
  await connection();
  const email = await guestEmail().catch(() => null);
  if (!email) return <MyBookingLink />;
  const row = await (await getDb())
    .prepare("SELECT full_name FROM guests WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email)
    .first<{ full_name: string }>()
    .catch(() => null);
  return <AccountMenu name={row?.full_name ?? null} email={email} />;
}
