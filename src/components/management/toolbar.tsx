import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils/cn";

/** Search + filters row that sits on top of list cards. Submits as GET params. */
export function ListToolbar({ placeholder, filters, className, defaultQuery, hidden }: { placeholder: string; filters?: ReactNode; className?: string; defaultQuery?: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" className={cn("flex flex-col gap-3 border-b border-ivory-200 p-4 md:flex-row md:items-center", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="relative flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input type="search" name="q" placeholder={placeholder} defaultValue={defaultQuery} className="pl-9" />
      </label>
      {filters ? <div className="grid grid-cols-2 gap-2 md:flex">{filters}</div> : null}
    </form>
  );
}

export function FilterSelect({ name, label, options, value }: { name: string; label: string; options: Array<[string, string]>; value?: string }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <Select name={name} defaultValue={value ?? ""} className="w-full md:w-auto md:min-w-36">
        <option value="">{label}: all</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </label>
  );
}

/** Segmented tabs (links), e.g. Arrivals / Departures / In house. */
export function Tabs({ items }: { items: Array<{ label: string; count?: number; active?: boolean; href: string }> }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-ivory-200 px-4">
      {items.map((t) => (
        <a
          key={t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap",
            t.active ? "border-navy-800 text-navy-950" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className={cn("rounded-full px-2 py-0.5 text-xs", t.active ? "bg-navy-800 text-white" : "bg-ivory-200 text-ink-600")}>{t.count}</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
