"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/platform/ui/ConfirmDialog";
import type { Environment } from "@/apps/flags/domain/constants";
import { OnOffBadge } from "@/apps/flags/components/OnOffBadge";

type Pending = { action: "enable" | "disable"; environment: Environment } | { action: "archive" };
type EnvRow = { environment: Environment; on: boolean; canChange: boolean; whyNot: string };

export function FlagControls({ flagKey, envs, archived, canArchive, archiveWhyNot }: { flagKey: string; envs: EnvRow[]; archived: boolean; canArchive: boolean; archiveWhyNot: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsReason = pending?.action !== "archive" && pending?.environment === "production";
  const title = !pending ? "" : pending.action === "archive" ? `Archive ${flagKey}?` : `Turn ${pending.action === "enable" ? "on" : "off"} in ${pending.environment}?`;

  async function submit() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/flags/${flagKey}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...pending, ...(reason.trim() && { reason }) }),
    });
    setBusy(false);
    if (res.ok) {
      setPending(null);
      setReason("");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(`${res.status}: ${body?.error?.message ?? "Request failed"}`);
    if (res.status === 409 || res.status === 403) router.refresh();
  }

  return (
    <div className="space-y-3">
      {envs.map((e) => (
        <div key={e.environment} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="w-24 text-sm font-medium capitalize">{e.environment}</span>
            <OnOffBadge on={e.on} archived={archived} />
          </div>
          {e.canChange ? (
            <button
              type="button"
              onClick={() => { setError(null); setPending({ action: e.on ? "disable" : "enable", environment: e.environment }); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${e.on ? "border border-slate-300 bg-white hover:bg-slate-50" : "bg-green-600 text-white hover:bg-green-700"}`}
            >
              {e.on ? "Turn off" : "Turn on"}
            </button>
          ) : (
            <span className="text-right text-xs text-slate-500">{e.whyNot}</span>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-1">
        {canArchive ? (
          <button type="button" onClick={() => { setError(null); setPending({ action: "archive" }); }} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Archive flag
          </button>
        ) : (
          <span className="text-xs text-slate-500">{archiveWhyNot}</span>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={title}
        description={needsReason ? "Production changes affect real customers and need a reason." : pending?.action === "archive" ? "Archived flags are off everywhere and can't be changed again." : undefined}
        tone={pending?.action === "archive" || pending?.action === "disable" ? "danger" : "default"}
        confirmLabel={pending?.action === "archive" ? "Archive" : "Confirm"}
        busy={busy}
        error={error}
        confirmDisabled={needsReason && !reason.trim()}
        onCancel={() => setPending(null)}
        onConfirm={submit}
      >
        <label className="block text-sm font-medium">
          Reason {needsReason ? "(required)" : "(optional)"}
          <textarea className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </ConfirmDialog>
    </div>
  );
}
