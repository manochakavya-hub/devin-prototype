import type { AuditEntry } from "@/platform/audit/log";
import { formatDateTime } from "@/platform/ui/format";

/** Chronological history for one subject (e.g. a case). Pass entries newest-first, as returned by queryAudit. */
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {[...entries].reverse().map((e) => {
        const note = typeof e.metadata?.note === "string" ? e.metadata.note : null;
        const attempted = typeof e.metadata?.attempted_action === "string" ? e.metadata.attempted_action : null;
        const denied = e.action === "denied";
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${denied ? "bg-red-500" : "bg-slate-400"}`} />
            <div className="text-xs text-slate-500">{formatDateTime(e.timestamp)}</div>
            <div className="text-sm">
              <span className="font-medium">{e.actorName ?? e.actorUserId}</span>{" "}
              {denied ? (
                <span className="text-red-700">was denied <code>{attempted ?? "action"}</code></span>
              ) : (
                <span><code>{e.action}</code></span>
              )}
              {e.fromStatus && e.toStatus && (
                <span className="text-slate-600"> · {e.fromStatus} → {e.toStatus}</span>
              )}
            </div>
            {e.reason && <div className="text-sm text-slate-700">Reason: {e.reason}</div>}
            {note && note !== e.reason && <div className="text-sm text-slate-600">Note: {note}</div>}
          </li>
        );
      })}
    </ol>
  );
}
