"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { hotel } from "@/config/hotel";
import { cn } from "@/lib/utils/cn";
import { readStationRaw, subscribeStation, type PrintLayout } from "@/lib/station";
import { PosReceipt, type PosReceiptData } from "./pos-receipt";
import { useStation } from "./use-station";

type Row = [label: string, value: string];

/**
 * The 80mm version of a document (hardware brief H6): the same till-roll style as the bar receipt.
 * Black on white, monospace, long names wrap, nothing clipped. Prints on the 80mm "thermal" page.
 */
export function ThermalReceipt({
  title,
  number,
  copy = false,
  rows,
  lines = [],
  total,
  after = [],
  footer = "Thank you. Please come again.",
}: {
  title: string;
  number: string;
  copy?: boolean;
  rows: Row[];
  lines?: { name: string; detail?: string; amount: string }[];
  total: Row;
  after?: Row[];
  footer?: string;
}) {
  const row = "flex justify-between gap-3";
  return (
    <div className="font-mono text-[13px] leading-relaxed text-ink-900">
      <header className="border-b border-dashed border-ink-400 pb-3 text-center">
        <p className="font-display text-lg leading-tight">{hotel.name}</p>
        <p className="text-xs uppercase tracking-[0.2em]">{title}</p>
        <p className="text-xs">{hotel.address.line1}, {hotel.address.city}</p>
        <p className="text-xs">{hotel.phoneDisplay}</p>
        {copy ? <p className="mt-1 text-sm font-bold tracking-[0.3em]">COPY</p> : null}
      </header>
      <dl className="space-y-0.5 border-b border-dashed border-ink-400 py-3">
        <div className={row}><dt>No.</dt><dd className="text-right">{number}</dd></div>
        {rows.map(([k, v]) => <div key={k} className={row}><dt className="shrink-0">{k}</dt><dd className="min-w-0 text-right break-words">{v}</dd></div>)}
      </dl>
      {lines.length ? (
        <ul className="space-y-1.5 border-b border-dashed border-ink-400 py-3">
          {lines.map((l, i) => (
            <li key={i}>
              <p className="break-words">{l.name}</p>
              <p className={row}><span>{l.detail ?? ""}</span><span className="shrink-0">{l.amount}</span></p>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="space-y-0.5 py-3">
        <div className={cn(row, "text-base font-bold")}><dt>{total[0]}</dt><dd>{total[1]}</dd></div>
        {after.map(([k, v]) => <div key={k} className={row}><dt>{k}</dt><dd className="text-right break-words">{v}</dd></div>)}
      </dl>
      <p className="border-t border-dashed border-ink-400 pt-3 text-center text-xs">{footer}</p>
    </div>
  );
}

/**
 * Chooses how this document prints at this station: the 80mm version (only it prints, on the
 * thermal page) or the A4 page as shown. With no station setting, the context decides (till → 80mm,
 * everything else → A4). "Don't print" falls back to A4 if someone prints anyway.
 */
export function PrintAs({ thermal, contextDefault = "a4" }: { thermal: ReactNode; contextDefault?: Exclude<PrintLayout, "none"> }) {
  const station = useStation();
  const configured = useStationConfigured();
  const layout = configured ? station.printLayout : contextDefault;
  if (layout !== "80mm") return null;
  return (
    <div data-print="" className="pos-receipt hidden print:block">
      {thermal}
    </div>
  );
}

/** Whether this computer has been set up on This station (otherwise the document's own default applies). */
export function useStationConfigured(): boolean {
  return useSyncExternalStore(subscribeStation, () => readStationRaw() !== null, () => false);
}

/** The bar receipt, printed the way this station prints: 80mm unless the station is set to A4 (bar context default). */
export function StationPosReceipt({ r }: { r: PosReceiptData }) {
  const station = useStation();
  const configured = useStationConfigured();
  const thermal = !configured || station.printLayout !== "a4";
  return <PosReceipt r={r} printable={thermal} />;
}
