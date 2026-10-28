import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTimeline } from "@/platform/audit/AuditTimeline";
import { queryAudit } from "@/platform/audit/log";
import { getUserById } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { formatDateTime } from "@/platform/ui/format";
import { StatusBadge, type BadgeTone } from "@/platform/ui/StatusBadge";
import { getDb } from "@/apps/kyc/db";
import type { KycCase } from "@/apps/kyc/db/schema";
import { CaseActions } from "@/apps/kyc/components/CaseActions";
import { CaseStatusBadge, RiskBadge } from "@/apps/kyc/components/badges";
import { KYC_APP, type CaseAction } from "@/apps/kyc/domain/constants";
import { allowedActions, checkOwnership, checkRolePermission } from "@/apps/kyc/domain/permissions";
import { getCase } from "@/apps/kyc/domain/service";
import { requirePageUser } from "@/apps/kyc/session";

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toLowerCase();

const PRIMARY_ACTION: Partial<Record<KycCase["status"], CaseAction>> = { pending: "claim", in_review: "approve", info_requested: "customer_replied" };

/** Human explanation for why no actions are offered, using the same policy the API enforces. */
function noActionReason(user: AppUser, kase: KycCase): string {
  const action = PRIMARY_ACTION[kase.status];
  if (!action) return `This case is ${kase.status} (final).`;
  const role = checkRolePermission(user, action, kase);
  if (!role.allowed) return role.reason;
  const own = checkOwnership(user, action, kase);
  return own.allowed ? "No actions available." : own.reason;
}

function Check({ label, value, tone }: { label: string; value: string; tone: BadgeTone }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <StatusBadge label={value} tone={tone} />
    </div>
  );
}

export default async function CaseDetailPage({ id }: { id: string }) {
  const user = await requirePageUser();
  const db = getDb();
  const kase = getCase(db, id);
  if (!kase) notFound();

  const history = queryAudit(db, { app: KYC_APP, caseId: kase.id });
  const actions = allowedActions(user, kase);
  const assignee = kase.assignedTo ? getUserById(db, kase.assignedTo) : undefined;
  const exact = kase.nameOnForm === kase.nameOnId;
  const loose = normalize(kase.nameOnForm) === normalize(kase.nameOnId);
  const docTone: BadgeTone = kase.idDocumentStatus === "verified" ? "success" : kase.idDocumentStatus === "expired" ? "warning" : "danger";
  const selfieTone: BadgeTone = kase.selfieMatchPct >= 85 ? "success" : kase.selfieMatchPct >= 70 ? "warning" : "danger";
  const sanctionsTone: BadgeTone = kase.sanctionsCheckResult === "clear" ? "success" : "danger";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/kyc" className="text-sm text-blue-700 hover:underline">← Back to queue</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{kase.applicantName}</h1>
          <span className="font-mono text-sm text-slate-500">{kase.id}</span>
          <CaseStatusBadge status={kase.status} />
          <RiskBadge risk={kase.riskLevel} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {kase.country} · Flagged: <span className="font-medium">{kase.flagReason}</span> · Opened {formatDateTime(kase.createdAt)} ·{" "}
          {assignee ? <>Assigned to <span className="font-medium">{assignee.id === user.id ? "you" : assignee.name}</span></> : "Unassigned"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Name comparison</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Name on application form</div>
                <div className="mt-1 text-lg font-medium">{kase.nameOnForm}</div>
              </div>
              <div className={`rounded-md p-3 ${exact ? "bg-slate-50" : "bg-amber-50 ring-1 ring-amber-200"}`}>
                <div className="text-xs text-slate-500">Name on ID document</div>
                <div className="mt-1 text-lg font-medium">{kase.nameOnId}</div>
              </div>
            </div>
            <p className="mt-3 text-sm">
              {exact ? (
                <span className="text-green-700">Exact match</span>
              ) : loose ? (
                <span className="text-amber-700">Matches after ignoring accents, case and punctuation: check it’s the same person</span>
              ) : (
                <span className="text-red-700">Names differ: possible nickname, transliteration, name order, or different person</span>
              )}
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Check results</h2>
            <div className="divide-y divide-slate-100">
              <Check label="ID document" value={kase.idDocumentStatus.replace("_", " ")} tone={docTone} />
              <Check label="Selfie vs ID photo match" value={`${kase.selfieMatchPct}%`} tone={selfieTone} />
              <Check label="Sanctions / PEP screening" value={kase.sanctionsCheckResult.replace("_", " ")} tone={sanctionsTone} />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Decision</h2>
            {actions.length > 0 ? (
              <CaseActions caseId={kase.id} actions={actions} />
            ) : (
              <p className="text-sm text-slate-600">{noActionReason(user, kase)}</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
              <Link href={`/kyc/audit?case=${kase.id}`} className="text-xs text-blue-700 hover:underline">Open in audit log</Link>
            </div>
            <AuditTimeline entries={history} />
          </section>
        </div>
      </div>
    </div>
  );
}
