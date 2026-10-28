import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/platform/db/client";
import { appendAudit, recordDenied } from "@/platform/audit/log";
import { featureFlags, type FeatureFlag } from "@/apps/flags/db/schema";
import {
  ENVIRONMENTS, FLAGS_APP, FLAG_KEY_PATTERN, MAX_DESCRIPTION_LENGTH, MAX_REASON_LENGTH, RESERVED_KEYS, TOGGLE_ACTIONS,
  toggleAuditAction, type Environment, type ToggleAction,
} from "@/apps/flags/domain/constants";
import { checkPermission } from "@/apps/flags/domain/permissions";

type Actor = { id: string; role: string };

export type ActionError = { status: 400 | 403 | 404 | 409; code: string; message: string };
export type FlagResult = { ok: true; flag: FeatureFlag; auditId: number } | { ok: false; error: ActionError };

const fail = (status: ActionError["status"], code: string, message: string): FlagResult => ({ ok: false, error: { status, code, message } });
const onOff = (v: boolean) => (v ? "on" : "off");

export function getFlag(db: Db, key: string): FeatureFlag | undefined {
  return db.select().from(featureFlags).where(eq(featureFlags.key, key)).get();
}

export function listFlags(db: Db): FeatureFlag[] {
  return db.select().from(featureFlags).orderBy(asc(featureFlags.key)).all();
}

function denied(db: Db, user: Actor, key: string, attempted: string, reason: string, fromStatus: string | null, metadata: Record<string, unknown> = {}): FlagResult {
  recordDenied(db, { app: FLAGS_APP, actorUserId: user.id, attemptedAction: attempted, reason, caseId: key, fromStatus, metadata: { role: user.role, ...metadata } });
  return fail(403, "forbidden", reason);
}

function optionalText(v: unknown, field: string, max: number): string | undefined | ActionError {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return { status: 400, code: `invalid_${field}`, message: `${field} must be a string` };
  const t = v.trim();
  if (t.length > max) return { status: 400, code: `invalid_${field}`, message: `${field} must be at most ${max} characters` };
  return t || undefined;
}
const isError = (v: unknown): v is ActionError => typeof v === "object" && v !== null && "status" in v;

class StaleFlagError extends Error {}
class DuplicateFlagError extends Error {}

/** Create a flag (off everywhere). Check order: permission (403, logged) → payload (400) → key free (409). */
export function createFlag(db: Db, user: Actor, input: { key?: unknown; description?: unknown }): FlagResult {
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const permission = checkPermission(user, "create");
  if (!permission.allowed) return denied(db, user, key || "(none)", "create", permission.reason, null);

  if (!FLAG_KEY_PATTERN.test(key) || RESERVED_KEYS.includes(key)) {
    return fail(400, "invalid_key", "key must be lower_snake_case, 3–50 characters, starting with a letter (and not 'audit' or 'new')");
  }
  const description = optionalText(input.description, "description", MAX_DESCRIPTION_LENGTH);
  if (isError(description)) return { ok: false, error: description };
  if (!description) return fail(400, "description_required", "description is required");
  if (getFlag(db, key)) return fail(409, "duplicate_key", `A flag named '${key}' already exists`);

  const now = new Date().toISOString();
  try {
    return db.transaction(
      (tx) => {
        const flag = tx.insert(featureFlags).values({
          key, description, ownerUserId: user.id, stagingEnabled: false, productionEnabled: false, archived: false, createdAt: now, updatedAt: now,
        }).onConflictDoNothing().returning().get();
        if (!flag) throw new DuplicateFlagError();
        const audit = appendAudit(tx, { app: FLAGS_APP, timestamp: now, actorUserId: user.id, action: "create", caseId: key, toStatus: "off", metadata: { description } });
        return { ok: true as const, flag, auditId: audit.id };
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    if (err instanceof DuplicateFlagError) return fail(409, "duplicate_key", `A flag named '${key}' already exists`);
    throw err;
  }
}

/**
 * Every change to an existing flag. Check order:
 *   1. action/environment known (400)   2. flag exists (404)
 *   3. permission (403, logged as "denied")
 *   4. state allows it: not archived, not already in that state, prod off before archiving (409, nothing logged)
 *   5. payload valid; production changes need a reason (400, nothing logged)
 *   6. conditional UPDATE + audit INSERT in one transaction (409 if someone else changed it first)
 */
export function performFlagAction(db: Db, user: Actor, key: string, input: { action?: unknown; environment?: unknown; reason?: unknown }): FlagResult {
  const action = input.action;
  if (action !== "archive" && !(TOGGLE_ACTIONS as readonly unknown[]).includes(action)) {
    return fail(400, "invalid_action", `Unknown action '${String(action)}'`);
  }
  const env = input.environment;
  if (action !== "archive" && !(ENVIRONMENTS as readonly unknown[]).includes(env)) {
    return fail(400, "invalid_environment", `environment must be one of: ${ENVIRONMENTS.join(", ")}`);
  }
  const flag = getFlag(db, key);
  if (!flag) return fail(404, "not_found", `Flag ${key} not found`);
  if (action === "archive") return archive(db, user, flag, input.reason);
  return toggleFlag(db, user, flag, action as ToggleAction, env as Environment, input.reason);
}

/** Applies a toggle based on a previously read snapshot; the UPDATE only matches if the flag is still in that state. */
export function toggleFlag(db: Db, user: Actor, flag: FeatureFlag, action: ToggleAction, env: Environment, rawReason: unknown): FlagResult {
  const column = env === "staging" ? featureFlags.stagingEnabled : featureFlags.productionEnabled;
  const current = env === "staging" ? flag.stagingEnabled : flag.productionEnabled;
  const target = action === "enable";
  const auditAction = toggleAuditAction(action, env);

  const permission = checkPermission(user, action, env);
  if (!permission.allowed) return denied(db, user, flag.key, auditAction, permission.reason, onOff(current), { environment: env });

  if (flag.archived) return fail(409, "archived", "Archived flags can't be changed");
  if (current === target) return fail(409, "no_change", `${flag.key} is already ${onOff(target)} in ${env}`);

  const reason = optionalText(rawReason, "reason", MAX_REASON_LENGTH);
  if (isError(reason)) return { ok: false, error: reason };
  if (env === "production" && !reason) return fail(400, "reason_required", "Changing production requires a reason");

  const now = new Date().toISOString();
  try {
    return db.transaction(
      (tx) => {
        const updated = tx.update(featureFlags)
          .set({ [env === "staging" ? "stagingEnabled" : "productionEnabled"]: target, updatedAt: now })
          .where(and(eq(featureFlags.key, flag.key), eq(column, current), eq(featureFlags.archived, false)))
          .returning().get();
        if (!updated) throw new StaleFlagError();
        const audit = appendAudit(tx, {
          app: FLAGS_APP, timestamp: now, actorUserId: user.id, action: auditAction, caseId: flag.key,
          fromStatus: onOff(current), toStatus: onOff(target), reason: reason ?? null, metadata: { environment: env },
        });
        return { ok: true as const, flag: updated, auditId: audit.id };
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    if (err instanceof StaleFlagError) return fail(409, "conflict", "This flag was changed by someone else. Reload and try again.");
    throw err;
  }
}

function archive(db: Db, user: Actor, flag: FeatureFlag, rawReason: unknown): FlagResult {
  const permission = checkPermission(user, "archive");
  if (!permission.allowed) return denied(db, user, flag.key, "archive", permission.reason, flag.archived ? "archived" : "active");
  if (flag.archived) return fail(409, "archived", `${flag.key} is already archived`);
  if (flag.productionEnabled) return fail(409, "production_on", "Turn the flag off in production before archiving it");

  const reason = optionalText(rawReason, "reason", MAX_REASON_LENGTH);
  if (isError(reason)) return { ok: false, error: reason };
  const now = new Date().toISOString();
  try {
    return db.transaction(
      (tx) => {
        const updated = tx.update(featureFlags).set({ archived: true, stagingEnabled: false, updatedAt: now })
          .where(and(eq(featureFlags.key, flag.key), eq(featureFlags.archived, false), eq(featureFlags.productionEnabled, false)))
          .returning().get();
        if (!updated) throw new StaleFlagError();
        const audit = appendAudit(tx, {
          app: FLAGS_APP, timestamp: now, actorUserId: user.id, action: "archive", caseId: flag.key,
          fromStatus: "active", toStatus: "archived", reason: reason ?? null, metadata: { staging_was: onOff(flag.stagingEnabled) },
        });
        return { ok: true as const, flag: updated, auditId: audit.id };
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    if (err instanceof StaleFlagError) return fail(409, "conflict", "This flag was changed by someone else. Reload and try again.");
    throw err;
  }
}

/** What the UI should offer this user for a flag. The API re-checks everything. */
export function flagCapabilities(user: Actor, flag: FeatureFlag) {
  const live = !flag.archived;
  return {
    staging: live && checkPermission(user, "enable", "staging").allowed,
    production: live && checkPermission(user, "enable", "production").allowed,
    archive: live && !flag.productionEnabled && checkPermission(user, "archive").allowed,
  };
}
