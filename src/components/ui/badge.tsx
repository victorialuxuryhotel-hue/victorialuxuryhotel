import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

/** Design R1: a word and a colour, never colour alone. Green = paid/done, amber = owes/waiting, red = overdue/out/void. */
export const toneClasses: Record<Tone, string> = {
  neutral: "bg-[#eceae4] text-ink-700",
  info: "bg-[#e8eefb] text-navy-800",
  success: "bg-[#e7f6ec] text-[#166534]",
  warning: "bg-[#fff4dc] text-[#8a4b06]",
  danger: "bg-[#fde8e8] text-[#a61b1b]",
  brand: "bg-[#e8eefb] text-navy-800",
};

export function Badge({ tone = "neutral", children, className, ...rest }: { tone?: Tone; children: ReactNode; className?: string; [data: `data-${string}`]: string }) {
  return (
    <span {...rest} className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-semibold", toneClasses[tone], className)}>
      {children}
    </span>
  );
}
