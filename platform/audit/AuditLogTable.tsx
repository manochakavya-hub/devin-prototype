"use client";

import Link from "next/link";
import type { AuditEntry } from "@/platform/audit/log";
import { DataTable, type DataTableColumn } from "@/platform/ui/DataTable";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { formatDateTime } from "@/platform/ui/format";

export function AuditLogTable({ entries, caseHrefPrefix }: { entries: AuditEntry[]; caseHrefPrefix?: string }) {
  const columns: DataTableColumn<AuditEntry>[] = [
    { key: "id", header: "#", sortable: true, className: "font-mono text-xs text-slate-500" },
    { key: "timestamp", header: "Time", sortable: true, render: (e) => <span className="whitespace-nowrap">{formatDateTime(e.timestamp)}</span> },
    { key: "actorName", header: "Actor", sortable: true, render: (e) => e.actorName ?? e.actorUserId },
    {
      key: "action", header: "Action", sortable: true,
      render: (e) => <StatusBadge label={e.action === "denied" ? `denied: ${String(e.metadata?.attempted_action ?? "?")}` : e.action} tone={e.action === "denied" ? "danger" : "neutral"} />,
    },
    {
      key: "caseId", header: "Subject", sortable: true,
      render: (e) => e.caseId ? (caseHrefPrefix ? <Link className="font-mono text-blue-700 hover:underline" href={`${caseHrefPrefix}${e.caseId}`}>{e.caseId}</Link> : <span className="font-mono">{e.caseId}</span>) : <span className="text-slate-400">—</span>,
    },
    { key: "transition", header: "Transition", render: (e) => (e.fromStatus || e.toStatus ? `${e.fromStatus ?? "∅"} → ${e.toStatus ?? "∅"}` : "") },
    { key: "reason", header: "Reason", render: (e) => <span className="text-slate-700">{e.reason ?? ""}</span> },
    { key: "metadata", header: "Metadata", render: (e) => <code className="block max-w-xs truncate text-xs text-slate-500" title={JSON.stringify(e.metadata)}>{JSON.stringify(e.metadata)}</code> },
  ];
  return (
    <DataTable
      rows={entries}
      columns={columns}
      rowKey={(e) => String(e.id)}
      defaultSort={{ key: "id", direction: "desc" }}
      pageSize={25}
      emptyMessage="No audit entries match these filters"
    />
  );
}
