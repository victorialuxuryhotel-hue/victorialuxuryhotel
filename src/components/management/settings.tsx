import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ActivityRow } from "@/domain/views";
import { formatDateTime } from "@/lib/format";

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

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}
