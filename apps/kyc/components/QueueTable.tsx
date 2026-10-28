"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/platform/ui/DataTable";
import { formatDuration } from "@/platform/ui/format";
import type { KycCase } from "@/apps/kyc/db/schema";
import { CASE_STATUSES, RISK_LEVELS } from "@/apps/kyc/domain/constants";
import { TERMINAL_STATUSES } from "@/apps/kyc/domain/stateMachine";
import { CaseStatusBadge, RiskBadge, statusLabel } from "@/apps/kyc/components/badges";

type Row = KycCase & { assigneeName: string | null };
const RISK_RANK = { low: 1, medium: 2, high: 3 } as const;

export function QueueTable({ rows, now, currentUserId }: { rows: Row[]; now: number; currentUserId: string }) {
  const columns: DataTableColumn<Row>[] = [
    { key: "id", header: "Case", sortable: true, render: (r) => <Link href={`/kyc/cases/${r.id}`} className="font-mono text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>{r.id}</Link> },
    { key: "applicantName", header: "Applicant", sortable: true, render: (r) => <span className="font-medium">{r.applicantName}</span> },
    { key: "country", header: "Country", sortable: true },
    { key: "riskLevel", header: "Risk", sortable: true, sortValue: (r) => RISK_RANK[r.riskLevel], render: (r) => <RiskBadge risk={r.riskLevel} /> },
    { key: "status", header: "Status", sortable: true, render: (r) => <CaseStatusBadge status={r.status} /> },
    { key: "flagReason", header: "Flag reason", render: (r) => <span className="text-slate-600">{r.flagReason}</span> },
    {
      key: "assigneeName", header: "Assigned to", sortable: true,
      render: (r) => r.assigneeName ? <span className={r.assignedTo === currentUserId ? "font-medium text-blue-700" : ""}>{r.assignedTo === currentUserId ? "You" : r.assigneeName}</span> : <span className="text-slate-400">—</span>,
    },
    {
      key: "createdAt", header: "Waiting", sortable: true,
      render: (r) => {
        const created = Date.parse(r.createdAt);
        if (TERMINAL_STATUSES.includes(r.status)) {
          return <span className="text-slate-400" title="Closed">closed in {formatDuration(Date.parse(r.updatedAt) - created)}</span>;
        }
        const waited = now - created;
        const tone = waited > 72 * 3_600_000 ? "text-red-700 font-medium" : waited > 24 * 3_600_000 ? "text-amber-700" : "text-slate-700";
        return <span className={`whitespace-nowrap ${tone}`} title={r.createdAt}>{formatDuration(waited)}</span>;
      },
    },
  ];

  const filters: DataTableFilter<Row>[] = [
    {
      key: "status", label: "Status",
      options: [{ value: "open", label: "Open (undecided)" }, ...CASE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))],
      matches: (r, v) => (v === "open" ? !TERMINAL_STATUSES.includes(r.status) : r.status === v),
    },
    { key: "riskLevel", label: "Risk level", options: RISK_LEVELS.map((r) => ({ value: r, label: r })) },
    {
      key: "assignee", label: "Assignment",
      options: [{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }],
      matches: (r, v) => (v === "me" ? r.assignedTo === currentUserId : r.assignedTo === null),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      filters={filters}
      rowKey={(r) => r.id}
      rowHref={(r) => `/kyc/cases/${r.id}`}
      search={{ placeholder: "Name or case ID", text: (r) => `${r.id} ${r.applicantName}` }}
      defaultSort={{ key: "createdAt", direction: "asc" }}
      defaultFilters={{ status: "open" }}
      pageSize={10}
      emptyMessage="No cases match these filters"
    />
  );
}
