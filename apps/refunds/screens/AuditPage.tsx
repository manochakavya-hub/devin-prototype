import { AuditLogViewer } from "@/platform/audit/AuditLogViewer";
import { getDb } from "@/apps/refunds/db";
import { REFUNDS_APP } from "@/apps/refunds/domain/constants";
import { requirePageUser } from "@/apps/refunds/session";

export default async function AuditPage({ searchParams }: { searchParams: { actor?: string; case?: string; action?: string } }) {
  await requirePageUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditLogViewer db={getDb()} app={REFUNDS_APP} searchParams={searchParams} caseHrefPrefix="/refunds/" subjectLabel="Refund ID" subjectPlaceholder="e.g. RF-2003" />
    </div>
  );
}
