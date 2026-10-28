import type { Db } from "@/platform/db/client";
import { listUsers } from "@/platform/auth/server";
import { AuditLogTable } from "@/platform/audit/AuditLogTable";
import { listAuditActions, queryAudit } from "@/platform/audit/log";

type Search = { actor?: string; case?: string; action?: string };

/** Server component: filters are plain GET params, so filtered views are linkable and the query runs in SQL. */
export function AuditLogViewer({ db, searchParams, caseHrefPrefix }: { db: Db; searchParams: Search; caseHrefPrefix?: string }) {
  const filters = {
    actorUserId: searchParams.actor || undefined,
    caseId: searchParams.case?.trim() || undefined,
    action: searchParams.action || undefined,
  };
  const entries = queryAudit(db, filters);
  const actors = listUsers(db);
  const actions = listAuditActions(db);
  const field = "mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-xs font-medium text-slate-600">
          Actor
          <select name="actor" defaultValue={filters.actorUserId ?? ""} className={field}>
            <option value="">All</option>
            {actors.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Action
          <select name="action" defaultValue={filters.action ?? ""} className={field}>
            <option value="">All</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Case ID
          <input name="case" defaultValue={filters.caseId ?? ""} placeholder="e.g. KYC-1013" className={`${field} w-40`} />
        </label>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Apply</button>
        <a href="?" className="px-2 py-1.5 text-sm text-slate-600 hover:underline">Clear</a>
        <span className="ml-auto text-xs text-slate-500">{entries.length} entries · append-only (DB triggers block UPDATE/DELETE)</span>
      </form>
      <AuditLogTable entries={entries} caseHrefPrefix={caseHrefPrefix} />
    </div>
  );
}
