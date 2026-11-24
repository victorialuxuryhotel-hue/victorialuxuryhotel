"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signViewAs, VIEW_AS_MINUTES } from "@/lib/auth/view-as-token";
import { logger } from "@/lib/logger";
import { getCurrentStaff, VIEW_AS_COOKIE } from "./auth";
import { activity, getDb, writeBatch } from "./db";

export async function startViewAsFrontDesk(): Promise<void> {
  const staff = await getCurrentStaff();
  const { sessionId } = await auth();
  const secret = process.env.VIEW_AS_SECRET ?? "";
  if (!staff || staff.viewAs || staff.twoStep || staff.role !== "owner" || !sessionId || secret.length < 32) {
    logger.warn("view_as.refused", { staffId: staff?.id ?? null, hasSecret: secret.length >= 32 });
    redirect("/app/today");
  }
  const db = await getDb();
  await writeBatch(db, { id: staff.id, role: "owner" }, [
    activity(db, "staff.view_as_started", "staff", staff.id, "Started viewing as front desk (read-only)"),
  ]);
  (await cookies()).set(VIEW_AS_COOKIE, await signViewAs(secret, staff.id, sessionId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VIEW_AS_MINUTES * 60,
  });
  redirect("/app/today");
}

export async function exitViewAs(): Promise<void> {
  const staff = await getCurrentStaff();
  const jar = await cookies();
  if (staff?.viewAs) {
    const db = await getDb();
    await writeBatch(db, { id: staff.id, role: "owner" }, [activity(db, "staff.view_as_ended", "staff", staff.id, "Stopped viewing as front desk")]);
  }
  jar.delete(VIEW_AS_COOKIE);
  redirect("/app/staff");
}
