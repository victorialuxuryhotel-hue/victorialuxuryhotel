import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { staffRole } from "@/domain/status";
import type { ActivityRow, StaffRow } from "@/domain/views";
import { formatDateTime } from "@/lib/format";

/** `manage` renders the per-row controls (owner only). */
export function StaffTable({ rows, manage }: { rows: StaffRow[]; manage?: (s: StaffRow) => ReactNode }) {
  return (
    <>
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((s) => (
          <li key={s.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-900">{s.name}</p>
                <p className="truncate text-sm text-ink-500">{s.email}</p>
                <p className="mt-1 text-xs text-ink-500">{staffRole[s.role]} · last sign-in {s.lastSignIn ? formatDateTime(s.lastSignIn) : "never"}</p>
              </div>
              {s.isActive ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}
            </div>
            {manage ? manage(s) : null}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
    <Table>
      <THead><tr><TH>Name</TH><TH>Role</TH><TH>Last sign-in</TH><TH>Access</TH>{manage ? <TH className="text-right">Change</TH> : null}</tr></THead>
      <TBody>
        {rows.map((s) => (
          <TR key={s.id}>
            <TD><p className="font-medium text-ink-900">{s.name}</p><p className="text-xs text-ink-500">{s.email}</p></TD>
            <TD>{staffRole[s.role]}</TD>
            <TD>{s.lastSignIn ? formatDateTime(s.lastSignIn) : "Never"}</TD>
            <TD>{s.isActive ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</TD>
            {manage ? <TD>{manage(s)}</TD> : null}
          </TR>
        ))}
      </TBody>
    </Table>
      </div>
    </>
  );
}

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
