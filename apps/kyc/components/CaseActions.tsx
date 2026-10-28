"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/platform/ui/ConfirmDialog";
import { ACTION_LABELS, REJECTION_REASONS, type CaseAction } from "@/apps/kyc/domain/constants";

const DIALOG: Partial<Record<CaseAction, { title: string; description: string; tone?: "danger" }>> = {
  approve: { title: "Approve this case?", description: "The applicant will pass KYC. This is final." },
  reject: { title: "Reject this case?", description: "The applicant will fail KYC. This is final. A reason code and note are required.", tone: "danger" },
  request_info: { title: "Request more information?", description: "The case moves to “info requested” until the customer replies." },
  customer_replied: { title: "Simulate customer reply?", description: "Stand-in for a real customer response: the case goes back to the pending queue, unassigned." },
};

const BUTTON: Record<CaseAction, string> = {
  claim: "bg-slate-900 text-white hover:bg-slate-700",
  approve: "bg-green-600 text-white hover:bg-green-700",
  reject: "bg-red-600 text-white hover:bg-red-700",
  request_info: "border border-slate-300 bg-white hover:bg-slate-50",
  customer_replied: "border border-dashed border-slate-400 bg-white hover:bg-slate-50",
};

export function CaseActions({ caseId, actions }: { caseId: string; actions: CaseAction[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<CaseAction | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: CaseAction) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/kyc/cases/${caseId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(action === "reject" && { reasonCode }), ...(note.trim() && { note }) }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(null);
      setNote("");
      setReasonCode("");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(`${res.status}: ${body?.error?.message ?? "Request failed"}`);
    if (res.status === 409 || res.status === 403) router.refresh();
  }

  function start(action: CaseAction) {
    setError(null);
    if (DIALOG[action]) setOpen(action);
    else void submit(action);
  }

  const dialog = open ? DIALOG[open] : undefined;
  const field = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a} type="button" disabled={busy} onClick={() => start(a)} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${BUTTON[a]}`}>
            {a === "customer_replied" ? "Customer replied (simulate)" : ACTION_LABELS[a]}
          </button>
        ))}
      </div>
      {error && !open && <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ConfirmDialog
        open={open !== null}
        title={dialog?.title ?? ""}
        description={dialog?.description}
        tone={dialog?.tone}
        confirmLabel={open ? ACTION_LABELS[open] : "Confirm"}
        busy={busy}
        error={error}
        confirmDisabled={open === "reject" && (!reasonCode || !note.trim())}
        onCancel={() => setOpen(null)}
        onConfirm={() => open && submit(open)}
      >
        {open === "reject" && (
          <label className="block text-sm font-medium">
            Reason code
            <select className={field} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Select a reason…</option>
              {Object.entries(REJECTION_REASONS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>
        )}
        {open && open !== "customer_replied" && (
          <label className="block text-sm font-medium">
            Note {open === "reject" ? "(required)" : "(optional)"}
            <textarea className={field} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
