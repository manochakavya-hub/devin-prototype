import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { Db } from "@/platform/db/client";
import { appendAudit, recordDenied } from "@/platform/audit/log";
import { kycCases, type KycCase } from "@/apps/kyc/db/schema";
import {
  CASE_STATUSES, REJECTION_REASONS, RISK_LEVELS,
  type CaseAction, type CaseStatus, type RejectionReason, type RiskLevel,
} from "@/apps/kyc/domain/constants";
import { checkOwnership, checkRolePermission, isDecision } from "@/apps/kyc/domain/permissions";
import { isCaseAction, nextStatus } from "@/apps/kyc/domain/stateMachine";

type Actor = { id: string; role: string };

export const MAX_NOTE_LENGTH = 2000;

export type ActionError = { status: 400 | 403 | 404 | 409; code: string; message: string };
export type ActionResult = { ok: true; case: KycCase; auditId: number } | { ok: false; error: ActionError };
export type ActionInput = { action?: unknown; reasonCode?: unknown; note?: unknown };
type ActionDetails = { reasonCode?: RejectionReason; note?: string };

const fail = (status: ActionError["status"], code: string, message: string): ActionResult => ({ ok: false, error: { status, code, message } });

export function getCase(db: Db, id: string): KycCase | undefined {
  return db.select().from(kycCases).where(eq(kycCases.id, id)).get();
}

export function isCaseStatus(v: unknown): v is CaseStatus {
  return typeof v === "string" && (CASE_STATUSES as readonly string[]).includes(v);
}
export function isRiskLevel(v: unknown): v is RiskLevel {
  return typeof v === "string" && (RISK_LEVELS as readonly string[]).includes(v);
}

/** Oldest first, matching the queue's default order. */
export function listCases(db: Db, filters: { status?: CaseStatus; riskLevel?: RiskLevel } = {}): KycCase[] {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(kycCases.status, filters.status));
  if (filters.riskLevel) conditions.push(eq(kycCases.riskLevel, filters.riskLevel));
  return db
    .select()
    .from(kycCases)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(kycCases.createdAt))
    .all();
}

function validateDetails(action: CaseAction, input: ActionInput): ActionDetails | ActionError {
  let note: string | undefined;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") return { status: 400, code: "invalid_note", message: "note must be a string" };
    note = input.note.trim() || undefined;
    if (note && note.length > MAX_NOTE_LENGTH) return { status: 400, code: "invalid_note", message: `note must be at most ${MAX_NOTE_LENGTH} characters` };
  }
  if (action !== "reject") return { note };

  if (typeof input.reasonCode !== "string" || !(input.reasonCode in REJECTION_REASONS)) {
    return { status: 400, code: "invalid_reason_code", message: `Rejecting requires reasonCode, one of: ${Object.keys(REJECTION_REASONS).join(", ")}` };
  }
  if (!note) return { status: 400, code: "note_required", message: "Rejecting requires a note" };
  return { reasonCode: input.reasonCode as RejectionReason, note };
}

/**
 * Single entry point for every case state change. Check order:
 *   1. action is known (400)          2. case exists (404)
 *   3. role may do this (403, logged as "denied")
 *   4. state machine allows it (409, nothing logged)
 *   5. actor owns the case for decisions (403, logged as "denied")
 *   6. payload is valid (400, nothing logged)
 *   7. conditional UPDATE + audit INSERT in one transaction (409 if someone else got there first)
 */
export function performCaseAction(db: Db, user: Actor, caseId: string, input: ActionInput): ActionResult {
  if (!isCaseAction(input.action)) return fail(400, "invalid_action", `Unknown action '${String(input.action)}'`);
  const action = input.action;
  const kase = getCase(db, caseId);
  if (!kase) return fail(404, "not_found", `Case ${caseId} not found`);

  const role = checkRolePermission(user, action, kase);
  if (!role.allowed) return denied(db, user, kase, action, role.reason);

  if (!nextStatus(kase.status, action)) {
    return fail(409, "invalid_transition", `Cannot ${action} a case with status '${kase.status}'`);
  }

  const owner = checkOwnership(user, action, kase);
  if (!owner.allowed) return denied(db, user, kase, action, owner.reason);

  const details = validateDetails(action, input);
  if ("status" in details) return { ok: false, error: details };

  return applyTransition(db, user, kase, action, details);
}

function denied(db: Db, user: Actor, kase: KycCase, action: CaseAction, reason: string): ActionResult {
  recordDenied(db, {
    actorUserId: user.id,
    attemptedAction: action,
    reason,
    caseId: kase.id,
    fromStatus: kase.status,
    metadata: { role: user.role, risk_level: kase.riskLevel },
  });
  return fail(403, "forbidden", reason);
}

class StaleCaseError extends Error {}

/**
 * Applies a transition based on a previously read snapshot. The UPDATE is conditional on the case
 * still being in the snapshot's state (and owned by the actor, for decisions), so if two requests
 * race only the first one changes a row; the other gets 409. The audit row is inserted in the same
 * transaction, so if it fails the state change is rolled back.
 */
export function applyTransition(db: Db, user: Actor, snapshot: KycCase, action: CaseAction, details: ActionDetails = {}): ActionResult {
  const to = nextStatus(snapshot.status, action);
  if (!to) return fail(409, "invalid_transition", `Cannot ${action} a case with status '${snapshot.status}'`);
  const now = new Date().toISOString();

  const guard: SQL[] = [eq(kycCases.id, snapshot.id), eq(kycCases.status, snapshot.status)];
  if (action === "claim") guard.push(isNull(kycCases.assignedTo));
  if (isDecision(action)) guard.push(eq(kycCases.assignedTo, user.id));

  const assignedTo = action === "claim" ? user.id : action === "customer_replied" ? null : snapshot.assignedTo;

  try {
    return db.transaction(
      (tx) => {
        const updated = tx
          .update(kycCases)
          .set({ status: to, assignedTo, updatedAt: now })
          .where(and(...guard))
          .returning()
          .get();
        if (!updated) throw new StaleCaseError();

        const audit = appendAudit(tx, {
          timestamp: now,
          actorUserId: user.id,
          action,
          caseId: snapshot.id,
          fromStatus: snapshot.status,
          toStatus: to,
          reason: details.reasonCode ?? details.note ?? null,
          metadata: {
            risk_level: snapshot.riskLevel,
            ...(details.reasonCode && { reason_code: details.reasonCode }),
            ...(details.note && { note: details.note }),
            ...(snapshot.assignedTo !== assignedTo && { assigned_to: { from: snapshot.assignedTo, to: assignedTo } }),
          },
        });
        return { ok: true as const, case: updated, auditId: audit.id };
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    if (err instanceof StaleCaseError) {
      return fail(409, "conflict", "This case was changed by someone else (e.g. already claimed). Reload and try again.");
    }
    throw err;
  }
}
