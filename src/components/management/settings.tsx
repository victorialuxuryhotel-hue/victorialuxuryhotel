import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ActivityRow } from "@/domain/views";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <div className="p-5"><EmptyState title="No activity yet" /></div>;
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-ink-900">{a.summary}</p>
            <p className="text-xs text-ink-500">{a.actor} · <span className="font-mono">{a.action}</span></p>
          </div>
          <p className="shrink-0 text-xs text-ink-500">{formatDateTime(a.at)}</p>
        </li>
      ))}
    </ul>
  );
}

export function SettingsNav({ links }: { links: Array<{ label: string; href: string; current: boolean }> }) {
  return (
    <nav aria-label="Settings sections" className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] md:w-48 md:shrink-0 md:flex-col">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.current ? "page" : undefined}
          className={cn("flex min-h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap", l.current ? "bg-white text-navy-950" : "text-ink-600 hover:bg-white/60")}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}
