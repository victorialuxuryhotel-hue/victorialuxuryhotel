import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="delayed-show flex min-h-48 flex-1 items-center justify-center gap-3 text-ink-500">
      <Spinner className="size-3.5 border-[1.5px] text-navy-700" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="delayed-show divide-y divide-hairline">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3.5">
          <div className="skeleton h-3.5 w-3/5" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ label = "Loading", rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-white">
      <div className="border-b border-hairline p-3"><div className="skeleton h-10" /></div>
      <SkeletonRows rows={rows} label={label} />
    </div>
  );
}

export function TileSkeleton({ label = "Loading", tiles = 12 }: { label?: string; tiles?: number }) {
  return (
    <div role="status" aria-label={label} aria-busy className="delayed-show grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-hairline bg-white p-3">
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-hairline bg-white px-6 py-12 text-center">
      {icon ? <div aria-hidden className="mb-2 text-gold-600 [&_svg]:size-7">{icon}</div> : null}
      <p className="text-base font-semibold text-navy-950">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-card border border-danger-700 px-6 py-12 text-center">
      <p className="font-display text-[21px] font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{description ?? "The connection may have dropped. Nothing was changed. Please try again."}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-md border border-hairline px-4 text-sm hover:bg-ink-900/7">
          Try again
        </button>
      ) : null}
    </div>
  );
}
