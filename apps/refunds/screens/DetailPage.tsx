import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTimeline } from "@/platform/audit/AuditTimeline";
import { queryAudit } from "@/platform/audit/log";
import { getUserById } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { formatDateTime } from "@/platform/ui/format";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { getDb } from "@/apps/refunds/db";
import type { RefundRequest } from "@/apps/refunds/db/schema";
import { RefundActions } from "@/apps/refunds/components/RefundActions";
import { RefundStatusBadge } from "@/apps/refunds/components/badges";
import { APPROVAL_LIMIT_CENTS, REFUNDS_APP, REFUND_CATEGORIES, formatMoney, type RefundAction } from "@/apps/refunds/domain/constants";
import { allowedActions, checkPermission } from "@/apps/refunds/domain/permissions";
import { getRefund } from "@/apps/refunds/domain/service";
import { requirePageUser } from "@/apps/refunds/session";

const PRIMARY_ACTION: Partial<Record<RefundRequest["status"], RefundAction>> = { requested: "approve", approved: "mark_paid" };

/** Why no buttons are shown, using the same policy the API enforces. */
function noActionReason(user: AppUser, refund: RefundRequest): string {
  const action = PRIMARY_ACTION[refund.status];
  if (!action) return `This refund is ${refund.status} (final).`;
  const p = checkPermission(user, action, refund);
  return p.allowed ? "No actions available." : p.reason;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export default async function DetailPage({ id }: { id: string }) {
  const user = await requirePageUser();
  const db = getDb();
  const refund = getRefund(db, id);
  if (!refund) notFound();

  const history = queryAudit(db, { app: REFUNDS_APP, caseId: refund.id });
  const actions = allowedActions(user, refund);
  const requester = getUserById(db, refund.requestedBy);
  const decider = refund.decidedBy ? getUserById(db, refund.decidedBy) : undefined;
  const overLimit = refund.amountCents > APPROVAL_LIMIT_CENTS;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/refunds" className="text-sm text-blue-700 hover:underline">← Back to requests</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{refund.customerName}</h1>
          <span className="font-mono text-sm text-slate-500">{refund.id}</span>
          <RefundStatusBadge status={refund.status} />
          {overLimit && <StatusBadge label="needs finance approver" tone="accent" />}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Requested {formatDateTime(refund.createdAt)} by <span className="font-medium">{requester?.id === user.id ? "you" : requester?.name}</span>
          {decider && <> · Decided by <span className="font-medium">{decider.id === user.id ? "you" : decider.name}</span></>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Request</h2>
            <div className="divide-y divide-slate-100">
              <Field label="Amount"><span className="text-lg font-semibold tabular-nums">{formatMoney(refund.amountCents)}</span></Field>
              <Field label="Approval">{overLimit ? `Over ${formatMoney(APPROVAL_LIMIT_CENTS)}: finance approver only` : `Within the agent limit (${formatMoney(APPROVAL_LIMIT_CENTS)})`}</Field>
              <Field label="Reason">{REFUND_CATEGORIES[refund.category]}</Field>
              <Field label="Order"><span className="font-mono">{refund.orderId}</span></Field>
              <Field label="Original payment">{refund.paymentRef}</Field>
              <Field label="Customer email">{refund.customerEmail}</Field>
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Customer message</h2>
            <blockquote className="border-l-4 border-slate-200 pl-3 text-slate-700">{refund.customerMessage}</blockquote>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Decision</h2>
            {actions.length > 0 ? <RefundActions refundId={refund.id} actions={actions} /> : <p className="text-sm text-slate-600">{noActionReason(user, refund)}</p>}
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
              <Link href={`/refunds/audit?case=${refund.id}`} className="text-xs text-blue-700 hover:underline">Open in audit log</Link>
            </div>
            <AuditTimeline entries={history} />
          </section>
        </div>
      </div>
    </div>
  );
}
