"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/platform/ui/DataTable";
import { formatDateTime } from "@/platform/ui/format";
import type { FeatureFlag } from "@/apps/flags/db/schema";
import { OnOffBadge } from "@/apps/flags/components/OnOffBadge";

type Row = FeatureFlag & { ownerName: string };

export function FlagsTable({ rows }: { rows: Row[] }) {
  const columns: DataTableColumn<Row>[] = [
    { key: "key", header: "Flag", sortable: true, render: (r) => <Link href={`/flags/${r.key}`} className="font-mono text-blue-700 hover:underline" onClick={(e) => e.stopPropagation()}>{r.key}</Link> },
    { key: "description", header: "Description", render: (r) => <span className="text-slate-600">{r.description}</span> },
    { key: "ownerName", header: "Owner", sortable: true },
    { key: "stagingEnabled", header: "Staging", sortable: true, sortValue: (r) => Number(r.stagingEnabled), render: (r) => <OnOffBadge on={r.stagingEnabled} archived={r.archived} /> },
    { key: "productionEnabled", header: "Production", sortable: true, sortValue: (r) => Number(r.productionEnabled), render: (r) => <OnOffBadge on={r.productionEnabled} archived={r.archived} /> },
    { key: "updatedAt", header: "Last changed", sortable: true, render: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.updatedAt)}</span> },
  ];

  const filters: DataTableFilter<Row>[] = [
    {
      key: "state", label: "State",
      options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
      matches: (r, v) => (v === "archived" ? r.archived : !r.archived),
    },
    {
      key: "production", label: "Production",
      options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
      matches: (r, v) => r.productionEnabled === (v === "on"),
    },
    {
      key: "staging", label: "Staging",
      options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
      matches: (r, v) => r.stagingEnabled === (v === "on"),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      filters={filters}
      rowKey={(r) => r.key}
      rowHref={(r) => `/flags/${r.key}`}
      search={{ placeholder: "Flag key or description", text: (r) => `${r.key} ${r.description}` }}
      defaultSort={{ key: "key", direction: "asc" }}
      defaultFilters={{ state: "active" }}
      pageSize={10}
      emptyMessage="No flags match these filters"
    />
  );
}
