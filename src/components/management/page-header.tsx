import type { ReactNode } from "react";

/** Title row for management pages, with primary actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-row items-end justify-between gap-3 border-b border-hairline bg-ivory-50 px-4 py-4 sm:py-5 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-2 [&>a]:min-h-11 [&>button]:min-h-11 md:[&>a]:min-h-0 md:[&>button]:min-h-0">{actions}</div> : null}
    </div>
  );
}
