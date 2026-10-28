"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/platform/ui/DataTable";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { formatDuration } from "@/platform/ui/format";
import type { RefundRequest } from "@/apps/refunds/db/schema";
import { APPROVAL_LIMIT_CENTS, REFUND_CATEGORIES, REFUND_STATUSES, formatMoney } from "@/apps/refunds/domain/constants";
import { TERMINAL_STATUSES } from "@/apps/refunds/domain/stateMachine";
import { RefundStatusBadge } from "@/apps/refunds/components/badges";

type Row = RefundRequest & { requesterName: string };

export function RefundsTable({ rows, now, currentUserId }: { rows: Row[]; now: number; currentUserId: string }) {
  const columns: DataTableColumn<Row>[] = [
    { key: "id", header: "Refund", sortable: true, render: (r) => <Link href={`/refunds/${r.id}`} className="font-mono text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>{r.id}</Link> },
    { key: "customerName", header: "Customer", sortable: true, render: (r) => <span className="font-medium">{r.customerName}</span> },
    {
      key: "amountCents", header: "Amount", sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="tabular-nums">{formatMoney(r.amountCents)}</span>
          {r.amountCents > APPROVAL_LIMIT_CENTS && <StatusBadge label="finance" tone="accent" />}
        </span>
      ),
    },
    { key: "category", header: "Reason", render: (r) => <span className="text-slate-600">{REFUND_CATEGORIES[r.category]}</span> },
    { key: "status", header: "Status", sortable: true, render: (r) => <RefundStatusBadge status={r.status} /> },
    { key: "requesterName", header: "Requested by", sortable: true, render: (r) => (r.requestedBy === currentUserId ? <span className="font-medium text-blue-700">You</span> : r.requesterName) },
    {
      key: "createdAt", header: "Age", sortable: true,
      render: (r) => {
        const created = Date.parse(r.createdAt);
        if (TERMINAL_STATUSES.includes(r.status)) return <span className="text-slate-400">closed in {formatDuration(Date.parse(r.updatedAt) - created)}</span>;
        const waited = now - created;
        const tone = waited > 48 * 3_600_000 ? "text-red-700 font-medium" : waited > 24 * 3_600_000 ? "text-amber-700" : "text-slate-700";
        return <span className={`whitespace-nowrap ${tone}`} title={r.createdAt}>{formatDuration(waited)}</span>;
      },
    },
  ];

  const filters: DataTableFilter<Row>[] = [
    {
      key: "status", label: "Status",
      options: [{ value: "open", label: "Open (needs action)" }, ...REFUND_STATUSES.map((s) => ({ value: s, label: s }))],
      matches: (r, v) => (v === "open" ? !TERMINAL_STATUSES.includes(r.status) : r.status === v),
    },
    {
      key: "amount", label: "Amount",
      options: [{ value: "within", label: `Up to ${formatMoney(APPROVAL_LIMIT_CENTS)}` }, { value: "over", label: `Over ${formatMoney(APPROVAL_LIMIT_CENTS)} (finance)` }],
      matches: (r, v) => (v === "over" ? r.amountCents > APPROVAL_LIMIT_CENTS : r.amountCents <= APPROVAL_LIMIT_CENTS),
    },
    {
      key: "requester", label: "Requested by",
      options: [{ value: "me", label: "Me" }, { value: "others", label: "Others" }],
      matches: (r, v) => (v === "me" ? r.requestedBy === currentUserId : r.requestedBy !== currentUserId),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      filters={filters}
      rowKey={(r) => r.id}
      rowHref={(r) => `/refunds/${r.id}`}
      search={{ placeholder: "Customer, refund or order ID", text: (r) => `${r.id} ${r.customerName} ${r.orderId}` }}
      defaultSort={{ key: "createdAt", direction: "asc" }}
      defaultFilters={{ status: "open" }}
      pageSize={10}
      emptyMessage="No refunds match these filters"
    />
  );
}
