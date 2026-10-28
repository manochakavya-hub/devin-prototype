import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection };
type SortValue = string | number | null | undefined;

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Value used for sorting; defaults to `row[key]`. */
  sortValue?: (row: T) => SortValue;
  sortable?: boolean;
  className?: string;
};

export type DataTableFilter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Defaults to `String(row[key]) === value`. */
  matches?: (row: T, value: string) => boolean;
};

export type TableState = {
  sort: SortState | null;
  filterValues: Record<string, string>;
  query: string;
  page: number;
  pageSize: number;
};

const field = <T,>(row: T, key: string): unknown => (row as Record<string, unknown>)[key];

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last regardless of direction is handled by caller
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Pure filter -> search -> sort -> paginate pipeline, kept separate from the component so it can be unit tested. */
export function applyTableState<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  filters: DataTableFilter<T>[],
  state: TableState,
  searchText?: (row: T) => string,
) {
  let result = rows.filter((row) =>
    filters.every((f) => {
      const value = state.filterValues[f.key];
      if (!value) return true;
      return f.matches ? f.matches(row, value) : String(field(row, f.key)) === value;
    }),
  );

  const q = state.query.trim().toLowerCase();
  if (q && searchText) result = result.filter((row) => searchText(row).toLowerCase().includes(q));

  if (state.sort) {
    const col = columns.find((c) => c.key === state.sort!.key);
    const getValue = col?.sortValue ?? ((row: T) => field(row, state.sort!.key) as SortValue);
    const dir = state.sort.direction === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null || vb == null) return compare(va, vb);
      return compare(va, vb) * dir;
    });
  }

  const total = result.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(Math.max(1, state.page), pageCount);
  const start = (page - 1) * state.pageSize;
  return { rows: result.slice(start, start + state.pageSize), total, page, pageCount, start };
}
