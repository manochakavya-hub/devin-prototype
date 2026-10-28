import { and, desc, eq, getTableColumns, isNull, or, type SQL } from "drizzle-orm";
import type { Db, DbExecutor } from "@/platform/db/client";
import { users } from "@/platform/auth/schema";
import { auditLog, type AuditRow } from "@/platform/audit/schema";

export type AuditEntryInput = {
  /** App id, e.g. "kyc". Omit only for platform-level events (login). */
  app?: string | null;
  actorUserId: string;
  action: string;
  caseId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  timestamp?: string;
};

/**
 * Appends one audit row. Pass the transaction handle (`tx`) when recording a state change so the
 * audit write commits or rolls back together with it.
 */
export function appendAudit(executor: DbExecutor, entry: AuditEntryInput): AuditRow {
  return executor
    .insert(auditLog)
    .values({
      timestamp: entry.timestamp ?? new Date().toISOString(),
      app: entry.app ?? null,
      actorUserId: entry.actorUserId,
      action: entry.action,
      caseId: entry.caseId ?? null,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
    })
    .returning()
    .get();
}

/** Records a permission denial as `action: "denied"`. Written on its own, since there is no state change. */
export function recordDenied(
  executor: DbExecutor,
  entry: { app?: string | null; actorUserId: string; attemptedAction: string; reason: string; caseId?: string | null; fromStatus?: string | null; metadata?: Record<string, unknown> },
): AuditRow {
  return appendAudit(executor, {
    app: entry.app,
    actorUserId: entry.actorUserId,
    action: "denied",
    caseId: entry.caseId,
    fromStatus: entry.fromStatus,
    reason: entry.reason,
    metadata: { attempted_action: entry.attemptedAction, ...entry.metadata },
  });
}

/** `app` limits results to that app's rows plus platform-level rows (app = null, e.g. logins). */
export type AuditFilters = { app?: string; actorUserId?: string; caseId?: string; action?: string; limit?: number };
export type AuditEntry = AuditRow & { actorName: string | null };

export function queryAudit(db: Db, filters: AuditFilters = {}): AuditEntry[] {
  const conditions: SQL[] = [];
  if (filters.app) conditions.push(or(eq(auditLog.app, filters.app), isNull(auditLog.app))!);
  if (filters.actorUserId) conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
  if (filters.caseId) conditions.push(eq(auditLog.caseId, filters.caseId));
  if (filters.action) conditions.push(eq(auditLog.action, filters.action));
  return db
    .select({ ...getTableColumns(auditLog), actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(filters.limit ?? 1000)
    .all();
}

export function listAuditActions(db: Db, app?: string): string[] {
  return db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .where(app ? or(eq(auditLog.app, app), isNull(auditLog.app)) : undefined)
    .orderBy(auditLog.action)
    .all()
    .map((r) => r.action);
}
