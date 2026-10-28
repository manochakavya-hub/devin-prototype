import { AuditLogViewer } from "@/platform/audit/AuditLogViewer";
import { getDb } from "@/apps/kyc/db";
import { requirePageUser } from "@/apps/kyc/session";

export default async function AuditPage({ searchParams }: { searchParams: { actor?: string; case?: string; action?: string } }) {
  await requirePageUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditLogViewer db={getDb()} app="kyc" searchParams={searchParams} caseHrefPrefix="/kyc/cases/" subjectLabel="Case ID" subjectPlaceholder="e.g. KYC-1013" />
    </div>
  );
}
