import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTimeline } from "@/platform/audit/AuditTimeline";
import { queryAudit } from "@/platform/audit/log";
import { getUserById } from "@/platform/auth/server";
import { formatDateTime } from "@/platform/ui/format";
import { getDb } from "@/apps/flags/db";
import { FlagControls } from "@/apps/flags/components/FlagControls";
import { OnOffBadge } from "@/apps/flags/components/OnOffBadge";
import { ENVIRONMENTS, FLAGS_APP } from "@/apps/flags/domain/constants";
import { checkPermission } from "@/apps/flags/domain/permissions";
import { flagCapabilities, getFlag } from "@/apps/flags/domain/service";
import { requirePageUser } from "@/apps/flags/session";

export default async function DetailPage({ flagKey }: { flagKey: string }) {
  const user = await requirePageUser();
  const db = getDb();
  const flag = getFlag(db, flagKey);
  if (!flag) notFound();

  const can = flagCapabilities(user, flag);
  const owner = getUserById(db, flag.ownerUserId);
  const history = queryAudit(db, { app: FLAGS_APP, caseId: flag.key });
  const whyNot = (env: (typeof ENVIRONMENTS)[number]) => {
    if (flag.archived) return "Archived";
    const p = checkPermission(user, "enable", env);
    return p.allowed ? "" : p.reason;
  };
  const archiveWhyNot = flag.archived
    ? "This flag is archived (final)."
    : (() => {
        const p = checkPermission(user, "archive");
        if (!p.allowed) return p.reason;
        return flag.productionEnabled ? "Turn it off in production before archiving." : "";
      })();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/flags" className="text-sm text-blue-700 hover:underline">← Back to flags</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{flag.key}</h1>
          {flag.archived && <OnOffBadge on={false} archived />}
        </div>
        <p className="mt-1 text-slate-700">{flag.description}</p>
        <p className="mt-1 text-sm text-slate-600">
          Owner <span className="font-medium">{owner?.id === user.id ? "you" : owner?.name}</span> · Created {formatDateTime(flag.createdAt)} · Last changed {formatDateTime(flag.updatedAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Environments</h2>
          <FlagControls
            flagKey={flag.key}
            archived={flag.archived}
            envs={ENVIRONMENTS.map((env) => ({ environment: env, on: env === "staging" ? flag.stagingEnabled : flag.productionEnabled, canChange: can[env], whyNot: whyNot(env) }))}
            canArchive={can.archive}
            archiveWhyNot={archiveWhyNot}
          />
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h2>
            <Link href={`/flags/audit?case=${flag.key}`} className="text-xs text-blue-700 hover:underline">Open in audit log</Link>
          </div>
          <AuditTimeline entries={history} />
        </section>
      </div>
    </div>
  );
}
