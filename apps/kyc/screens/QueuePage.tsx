import { listUsers } from "@/platform/auth/server";
import { getDb } from "@/apps/kyc/db";
import { QueueTable } from "@/apps/kyc/components/QueueTable";
import { listCases } from "@/apps/kyc/domain/service";
import { requirePageUser } from "@/apps/kyc/session";

export default async function QueuePage() {
  const user = await requirePageUser();
  const db = getDb();
  const names = new Map(listUsers(db).map((u) => [u.id, u.name]));
  const rows = listCases(db).map((c) => ({ ...c, assigneeName: c.assignedTo ? (names.get(c.assignedTo) ?? c.assignedTo) : null }));
  const open = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-sm text-slate-600">{open} pending · {rows.length} total · oldest first</p>
      </div>
      <QueueTable rows={rows} now={Date.now()} currentUserId={user.id} />
    </div>
  );
}
