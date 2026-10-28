"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/platform/ui/ConfirmDialog";

export function NewFlagButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/flags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key.trim(), description }) });
    setBusy(false);
    if (res.ok) {
      router.push(`/flags/${key.trim()}`);
      return;
    }
    const body = await res.json().catch(() => null);
    setError(`${res.status}: ${body?.error?.message ?? "Request failed"}`);
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true); }} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
        New flag
      </button>
      <ConfirmDialog
        open={open}
        title="Create a feature flag"
        description="New flags start off in staging and production."
        confirmLabel="Create flag"
        busy={busy}
        error={error}
        confirmDisabled={!key.trim() || !description.trim()}
        onCancel={() => setOpen(false)}
        onConfirm={submit}
      >
        <label className="block text-sm font-medium">
          Key <span className="font-normal text-slate-500">(lower_snake_case)</span>
          <input className={`${field} font-mono`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. new_checkout_flow" maxLength={50} />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea className={field} rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </ConfirmDialog>
    </>
  );
}
