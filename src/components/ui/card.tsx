import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 overflow-clip rounded-card border border-hairline bg-white", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
      <div>
        <h2 className="font-sans text-[15px] text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
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
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{caption}</p>
    </Card>
  );
}
