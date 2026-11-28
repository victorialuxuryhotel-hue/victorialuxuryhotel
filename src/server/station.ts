"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { recordId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { actorOf, authorize, getCurrentStaff, getStation, STAFF_SESSION_COOKIE, STATION_COOKIE } from "./auth";
import { getDb } from "./db";
import { createStation, endSession, pinSignIn, revokeStation, roster, setStaffPin, type RosterEntry, type StationType } from "./domain/stations";

const pepper = () => process.env.PIN_PEPPER ?? "";
const secure = () => process.env.NODE_ENV === "production";

/** Set up this computer as a station (owner or GM, signed in through Clerk). The browser then signs out of Clerk. */
export async function setUpStation(_prev: ActionResult<{ name: string }> | null, formData: FormData): Promise<ActionResult<{ name: string }>> {
  try {
    const me = await authorize("stations.manage");
    if (me.station) throw new AppError("VALIDATION", "This computer is already a station.");
    const v = z.object({ name: z.string(), type: z.enum(["desk", "restaurant", "bar", "office"]) }).safeParse(Object.fromEntries(formData));
    if (!v.success) throw new AppError("VALIDATION", "Choose what this computer is used for.", { fieldErrors: { type: ["Choose one"] } });
    const { token } = await createStation(await getDb(), actorOf(me), { name: v.data.name, type: v.data.type as StationType });
    (await cookies()).set(STATION_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
    return ok({ name: v.data.name.trim() });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("station.setup_failed", err);
    return toActionError(err);
  }
}

/** The owner revokes a station: everyone on it is signed out. */
export async function revokeStationAction(stationId: string): Promise<ActionResult> {
  try {
    const me = await authorize("staff.manage");
    await revokeStation(await getDb(), actorOf(me), recordId().parse(stationId));
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}

export async function stationRoster(): Promise<RosterEntry[]> {
  const station = await getStation();
  return station ? roster(await getDb(), station) : [];
}

const signInSchema = z.object({ staffId: recordId(), pin: z.string().regex(/^\d{4,6}$/, "Enter your PIN"), newPin: z.string().optional() });

/** Tap a name and enter the PIN. Answers "choose_new" when the owner set the PIN and the person must choose their own. */
export async function signInWithPin(input: { staffId: string; pin: string; newPin?: string }): Promise<ActionResult<{ status: "signed_in" | "choose_new"; name?: string }>> {
  try {
    const station = await getStation();
    if (!station) throw new AppError("UNAUTHENTICATED", "This computer isn't set up as a station. A manager signs in to set it up.");
    const v = signInSchema.safeParse(input);
    if (!v.success) throw new AppError("VALIDATION", "Enter your PIN: 4 to 6 digits.", { fieldErrors: { pin: ["Enter your PIN"] } });
    const r = await pinSignIn(await getDb(), station, { staffId: v.data.staffId, pin: v.data.pin, newPin: v.data.newPin || null }, pepper());
    if (r.status === "choose_new") return ok({ status: "choose_new" });
    (await cookies()).set(STAFF_SESSION_COOKIE, r.token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 60 * 60 * 16 });
    return ok({ status: "signed_in", name: r.staff.fullName });
  } catch (err) {
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("station.sign_in_failed", err);
    return toActionError(err);
  }
}

/** Lock (the button) or the idle timer: ends the session on the server and goes back to the name grid. */
export async function lockStation(reason: "lock" | "idle"): Promise<void> {
  const station = await getStation();
  if (!station) return;
  // The cookie is left as it is (it no longer matches an open session): changing a cookie in a server
  // action makes Next re-render the page, which would send the screen to /station and lose an open order.
  await endSession(await getDb(), station, (await cookies()).get(STAFF_SESSION_COOKIE)?.value, reason === "idle" ? "idle" : "lock");
}

/** Screen activity keeps the server session alive while someone works without saving anything (typing an order). */
export async function stationHeartbeat(): Promise<{ signedIn: boolean }> {
  const staff = await getCurrentStaff();
  return { signedIn: Boolean(staff?.station) };
}

/** The owner sets or resets a PIN (staff.manage). The person chooses their own at their next sign-in. */
export async function setPin(input: { staffId: string; pin: string }): Promise<ActionResult> {
  try {
    const me = await authorize("staff.manage");
    await setStaffPin(await getDb(), actorOf(me), recordId().parse(input.staffId), String(input.pin ?? ""), pepper());
    refresh();
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
