import { describe, expect, it } from "vitest";
import { applyTableState, type DataTableColumn } from "@/platform/ui/dataTableState";

type Row = { id: string; n: number | null; kind: string };
const rows: Row[] = [
  { id: "a", n: 3, kind: "x" },
  { id: "b", n: 1, kind: "y" },
  { id: "c", n: null, kind: "x" },
  { id: "d", n: 2, kind: "x" },
];
const columns: DataTableColumn<Row>[] = [{ key: "id", header: "ID" }, { key: "n", header: "N", sortable: true }];
const base = { sort: null, filterValues: {}, query: "", page: 1, pageSize: 10 };

describe("applyTableState", () => {
  it("sorts with nulls last in both directions", () => {
    const asc = applyTableState(rows, columns, [], { ...base, sort: { key: "n", direction: "asc" } });
    expect(asc.rows.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    const desc = applyTableState(rows, columns, [], { ...base, sort: { key: "n", direction: "desc" } });
    expect(desc.rows.map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("filters and paginates", () => {
    const filters = [{ key: "kind", label: "Kind", options: [] }];
    const view = applyTableState(rows, columns, filters, { ...base, filterValues: { kind: "x" }, pageSize: 2, page: 2 });
    expect(view.total).toBe(3);
    expect(view.pageCount).toBe(2);
    expect(view.rows.map((r) => r.id)).toEqual(["d"]);
  });

  it("clamps out-of-range pages", () => {
    expect(applyTableState(rows, columns, [], { ...base, page: 99, pageSize: 3 }).page).toBe(2);
  });
});
