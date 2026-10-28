import { AuditLogViewer } from "@/platform/audit/AuditLogViewer";
import { getDb } from "@/apps/flags/db";
import { FLAGS_APP } from "@/apps/flags/domain/constants";
import { requirePageUser } from "@/apps/flags/session";

export default async function AuditPage({ searchParams }: { searchParams: { actor?: string; case?: string; action?: string } }) {
  await requirePageUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditLogViewer db={getDb()} app={FLAGS_APP} searchParams={searchParams} caseHrefPrefix="/flags/" subjectLabel="Flag key" subjectPlaceholder="e.g. instant_payouts" />
    </div>
  );
}
