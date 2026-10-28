"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  applyTableState,
  type DataTableColumn,
  type DataTableFilter,
  type SortState,
} from "@/platform/ui/dataTableState";

export type { DataTableColumn, DataTableFilter, SortState } from "@/platform/ui/dataTableState";

type Props<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  filters?: DataTableFilter<T>[];
  search?: { placeholder: string; text: (row: T) => string };
  defaultSort?: SortState;
  /** Initial filter selections, keyed by filter key. */
  defaultFilters?: Record<string, string>;
  pageSize?: number;
  rowHref?: (row: T) => string;
  emptyMessage?: string;
};

/**
 * Client-side sortable / filterable / paginated table. Fine for hundreds of rows; for larger data
 * sets the same props could be driven by server-side queries.
 */
export function DataTable<T>({
  rows, columns, rowKey, filters = [], search, defaultSort, defaultFilters, pageSize = 10, rowHref, emptyMessage = "No rows",
}: Props<T>) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(defaultFilters ?? {});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const view = useMemo(
    () => applyTableState(rows, columns, filters, { sort, filterValues, query, page, pageSize }, search?.text),
    [rows, columns, filters, sort, filterValues, query, page, pageSize, search?.text],
  );

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? { key, direction: s.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
    setPage(1);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {(filters.length > 0 || search) && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          {filters.map((f) => (
            <label key={f.key} className="text-xs font-medium text-slate-600">
              {f.label}
              <select
                className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                value={filterValues[f.key] ?? ""}
                onChange={(e) => {
                  setFilterValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          ))}
          {search && (
            <label className="text-xs font-medium text-slate-600">
              Search
              <input
                type="search"
                className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                placeholder={search.placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-3 py-2 font-medium ${c.className ?? ""}`}
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.sortable ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-slate-900">
                        {c.header}
                        <span aria-hidden className="text-[10px]">{active ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">{emptyMessage}</td>
              </tr>
            ) : (
              view.rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={rowHref ? () => router.push(rowHref(row)) : undefined}
                  className={rowHref ? "cursor-pointer hover:bg-slate-50" : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-top ${c.className ?? ""}`}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span>
          {view.total === 0 ? "0 results" : `Showing ${view.start + 1}–${view.start + view.rows.length} of ${view.total}`}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
            Prev
          </button>
          <span>Page {view.page} / {view.pageCount}</span>
          <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={view.page >= view.pageCount} onClick={() => setPage(view.page + 1)}>
            Next
          </button>
        </span>
      </div>
    </div>
  );
}
