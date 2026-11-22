import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-ivory-200 text-ink-700",
  info: "bg-info-50 text-info-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  brand: "bg-navy-50 text-navy-800",
};

/**
 * Status tag (Classical: square, 11px, word first). Colour is never the only
 * signal: the label is always text. Domain status → tone maps live with each domain.
 */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[3px] px-2.5 py-0.5 text-[11px] tracking-[0.02em]", tones[tone], className)}>
      {children}
    </span>
  );
}
