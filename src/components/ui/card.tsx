import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 overflow-clip rounded-card border border-hairline bg-ivory-50", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
      <div>
        <h2 className="text-xl text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * A white card with a heading, an optional count and an action at the right (designs R101–R109): group, then list.
 * `tone="danger"` colours the count red (overdue, short).
 */
export function Section({ title, count, tone, action, children, className, id, bodyClassName }: {
  title: ReactNode; count?: number; tone?: "danger" | "warning"; action?: ReactNode; children?: ReactNode; className?: string; id?: string; bodyClassName?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("min-w-0 overflow-clip rounded-xl border border-hairline bg-white", className)}>
      <div className={cn("flex min-h-[49px] items-center gap-2.5 px-4 py-2", children ? "border-b border-hairline" : "")}>
        <h2 id={headingId} className="text-base font-bold text-ink-900">{title}</h2>
        {count !== undefined ? (
          <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-2 text-[13px] font-semibold tabular-nums", tone === "danger" ? "bg-[#fde8e8] text-[#a61b1b]" : tone === "warning" ? "bg-[#fff4dc] text-[#8a4b06]" : "bg-[#eceae4] text-ink-700")}>{count}</span>
        ) : null}
        {action ? <span className="ml-auto flex items-center gap-2">{action}</span> : null}
      </div>
      {children ? <div className={bodyClassName}>{children}</div> : null}
    </section>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-clip rounded-card border border-hairline bg-hairline",
        "max-sm:[&>*]:rounded-none max-sm:[&>*]:border-0 max-sm:[&>*]:shadow-none max-sm:[&>*:last-child:nth-child(odd)]:col-span-2",
        "sm:gap-4 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
  return (
    <Card className="min-w-0 px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-xs text-ink-500 sm:text-sm">{label}</p>
      <p className="mt-1 truncate font-display text-3xl font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{caption}</p>
    </Card>
  );
}
