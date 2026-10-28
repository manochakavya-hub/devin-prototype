import { listUsers } from "@/platform/auth/server";
import { getDb } from "@/apps/flags/db";
import { FlagsTable } from "@/apps/flags/components/FlagsTable";
import { NewFlagButton } from "@/apps/flags/components/NewFlagButton";
import { checkPermission } from "@/apps/flags/domain/permissions";
import { listFlags } from "@/apps/flags/domain/service";
import { requirePageUser } from "@/apps/flags/session";

export default async function ListPage() {
  const user = await requirePageUser();
  const db = getDb();
  const names = new Map(listUsers(db).map((u) => [u.id, u.name]));
  const rows = listFlags(db).map((f) => ({ ...f, ownerName: names.get(f.ownerUserId) ?? f.ownerUserId }));
  const active = rows.filter((r) => !r.archived);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Feature flags</h1>
          <p className="text-sm text-slate-600">
            {active.length} active · {active.filter((r) => r.productionEnabled).length} on in production · {active.filter((r) => r.stagingEnabled && !r.productionEnabled).length} staging only
          </p>
        </div>
        {checkPermission(user, "create").allowed && <NewFlagButton />}
      </div>
      <FlagsTable rows={rows} />
    </div>
  );
}
