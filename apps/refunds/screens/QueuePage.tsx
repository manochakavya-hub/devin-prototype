import { listUsers } from "@/platform/auth/server";
import { getDb } from "@/apps/refunds/db";
import { RefundsTable } from "@/apps/refunds/components/RefundsTable";
import { APPROVAL_LIMIT_CENTS, formatMoney } from "@/apps/refunds/domain/constants";
import { listRefunds } from "@/apps/refunds/domain/service";
import { requirePageUser } from "@/apps/refunds/session";

export default async function QueuePage() {
  const user = await requirePageUser();
  const db = getDb();
  const names = new Map(listUsers(db).map((u) => [u.id, u.name]));
  const rows = listRefunds(db).map((r) => ({ ...r, requesterName: names.get(r.requestedBy) ?? r.requestedBy }));
  const waiting = rows.filter((r) => r.status === "requested");
  const toPay = rows.filter((r) => r.status === "approved");

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Refund requests</h1>
        <p className="text-sm text-slate-600">
          {waiting.length} awaiting decision ({formatMoney(waiting.reduce((s, r) => s + r.amountCents, 0))}) · {toPay.length} approved, awaiting payment · agents can decide up to {formatMoney(APPROVAL_LIMIT_CENTS)}
        </p>
      </div>
      <RefundsTable rows={rows} now={Date.now()} currentUserId={user.id} />
    </div>
  );
}
