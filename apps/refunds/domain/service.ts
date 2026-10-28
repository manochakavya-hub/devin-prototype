import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Db } from "@/platform/db/client";
import { appendAudit, recordDenied } from "@/platform/audit/log";
import { refundRequests, type RefundRequest } from "@/apps/refunds/db/schema";
import {
  DECISION_ACTIONS, REFUNDS_APP, REFUND_STATUSES, REJECTION_REASONS,
  type RefundAction, type RefundRejectionReason, type RefundStatus,
} from "@/apps/refunds/domain/constants";
import { checkPermission } from "@/apps/refunds/domain/permissions";
import { isRefundAction, nextStatus } from "@/apps/refunds/domain/stateMachine";

type Actor = { id: string; role: string };

export const MAX_NOTE_LENGTH = 2000;

export type ActionError = { status: 400 | 403 | 404 | 409; code: string; message: string };
export type ActionResult = { ok: true; refund: RefundRequest; auditId: number } | { ok: false; error: ActionError };
export type ActionInput = { action?: unknown; reasonCode?: unknown; note?: unknown };
type ActionDetails = { reasonCode?: RefundRejectionReason; note?: string };

const fail = (status: ActionError["status"], code: string, message: string): ActionResult => ({ ok: false, error: { status, code, message } });

export function getRefund(db: Db, id: string): RefundRequest | undefined {
  return db.select().from(refundRequests).where(eq(refundRequests.id, id)).get();
}

export function isRefundStatus(v: unknown): v is RefundStatus {
  return typeof v === "string" && (REFUND_STATUSES as readonly string[]).includes(v);
}

/** Oldest first. */
export function listRefunds(db: Db, filters: { status?: RefundStatus } = {}): RefundRequest[] {
  return db.select().from(refundRequests)
    .where(filters.status ? eq(refundRequests.status, filters.status) : undefined)
    .orderBy(asc(refundRequests.createdAt)).all();
}

function validateDetails(action: RefundAction, input: ActionInput): ActionDetails | ActionError {
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
  return { reasonCode: input.reasonCode as RefundRejectionReason, note };
}

/**
 * Single entry point for every refund state change. Check order:
 *   1. action is known (400)   2. refund exists (404)
 *   3. permission: role, approval limit, two-person rule (403, logged as "denied")
 *   4. state machine allows it (409, nothing logged)
 *   5. payload is valid (400, nothing logged)
 *   6. conditional UPDATE + audit INSERT in one transaction (409 if someone else got there first)
 */
export function performRefundAction(db: Db, user: Actor, refundId: string, input: ActionInput): ActionResult {
  if (!isRefundAction(input.action)) return fail(400, "invalid_action", `Unknown action '${String(input.action)}'`);
  const action = input.action;
  const refund = getRefund(db, refundId);
  if (!refund) return fail(404, "not_found", `Refund ${refundId} not found`);

  const permission = checkPermission(user, action, refund);
  if (!permission.allowed) {
    recordDenied(db, {
      app: REFUNDS_APP,
      actorUserId: user.id,
      attemptedAction: action,
      reason: permission.reason,
      caseId: refund.id,
      fromStatus: refund.status,
      metadata: { role: user.role, amount_cents: refund.amountCents },
    });
    return fail(403, "forbidden", permission.reason);
  }

  if (!nextStatus(refund.status, action)) {
    return fail(409, "invalid_transition", `Cannot ${action} a refund with status '${refund.status}'`);
  }

  const details = validateDetails(action, input);
  if ("status" in details) return { ok: false, error: details };

  return applyRefundTransition(db, user, refund, action, details);
}

class StaleRefundError extends Error {}

/** Conditional on the refund still having the snapshot's status; the audit row commits or rolls back with it. */
export function applyRefundTransition(db: Db, user: Actor, snapshot: RefundRequest, action: RefundAction, details: ActionDetails = {}): ActionResult {
  const to = nextStatus(snapshot.status, action);
  if (!to) return fail(409, "invalid_transition", `Cannot ${action} a refund with status '${snapshot.status}'`);
  const now = new Date().toISOString();
  const guard: SQL[] = [eq(refundRequests.id, snapshot.id), eq(refundRequests.status, snapshot.status)];
  const decidedBy = DECISION_ACTIONS.includes(action) ? user.id : snapshot.decidedBy;

  try {
    return db.transaction(
      (tx) => {
        const updated = tx.update(refundRequests).set({ status: to, decidedBy, updatedAt: now }).where(and(...guard)).returning().get();
        if (!updated) throw new StaleRefundError();
        const audit = appendAudit(tx, {
          app: REFUNDS_APP,
          timestamp: now,
          actorUserId: user.id,
          action,
          caseId: snapshot.id,
          fromStatus: snapshot.status,
          toStatus: to,
          reason: details.reasonCode ?? details.note ?? null,
          metadata: {
            amount_cents: snapshot.amountCents,
            ...(details.reasonCode && { reason_code: details.reasonCode }),
            ...(details.note && { note: details.note }),
          },
        });
        return { ok: true as const, refund: updated, auditId: audit.id };
      },
      { behavior: "immediate" },
    );
  } catch (err) {
    if (err instanceof StaleRefundError) return fail(409, "conflict", "This refund was changed by someone else. Reload and try again.");
    throw err;
  }
}
