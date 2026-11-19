import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden rounded-card border border-ivory-200 bg-white shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ivory-200 px-5 py-4">
      <div>
        <h2 className="font-medium text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Dashboard figure. `caption` is required so every number states what it
 * measures (e.g. "Payments received" vs "Booked value"). The brief requires
 * never letting booking totals read as cash received.
 */
export function Stat({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{caption}</p>
    </Card>
  );
}
