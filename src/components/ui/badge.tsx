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

export function Badge({ tone = "neutral", children, className, ...rest }: { tone?: Tone; children: ReactNode; className?: string; [data: `data-${string}`]: string }) {
  return (
    <span {...rest} className={cn("inline-flex items-center whitespace-nowrap rounded-[3px] px-2.5 py-0.5 text-xs tracking-[0.02em]", tones[tone], className)}>
      {children}
    </span>
  );
}
