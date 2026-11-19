import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-1 items-center justify-center gap-3 text-ink-500">
      <Spinner className="text-navy-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-300 px-6 py-12 text-center">
      <p className="font-medium text-ink-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-card border border-danger-600/20 bg-danger-50 px-6 py-12 text-center">
      <p className="font-medium text-danger-700">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{description ?? "Please try again. If the problem continues, contact support."}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium hover:bg-ivory-100">
          Try again
        </button>
      ) : null}
    </div>
  );
}
