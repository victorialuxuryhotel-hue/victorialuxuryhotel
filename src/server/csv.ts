import "server-only";
import { toActionError } from "@/lib/errors";
import { csvField } from "./domain/reports";

export const lagosDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const lagosTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const naira = (kobo: number) => Math.round(kobo) / 100;

export function csvResponse(filename: string, header: string[], rows: (string | number | null)[][]): Response {
  const lines = [header, ...rows].map((r) => r.map((v) => csvField(v)).join(","));
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function deniedResponse(err: unknown): Response {
  const e = toActionError(err);
  return new Response(e.message, { status: e.code === "UNAUTHENTICATED" ? 401 : 403 });
}
