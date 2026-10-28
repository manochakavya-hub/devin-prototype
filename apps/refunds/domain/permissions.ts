import { allow, deny, type Decision } from "@/platform/auth/policy";
import type { RefundRequest } from "@/apps/refunds/db/schema";
import {
  APPROVAL_LIMIT_CENTS, DECISION_ACTIONS, REFUND_ACTIONS, REFUND_ROLES, formatMoney,
  type RefundAction, type RefundRole,
} from "@/apps/refunds/domain/constants";
import { nextStatus } from "@/apps/refunds/domain/stateMachine";

type Actor = { id: string; role: string };

export function isRefundRole(role: string): role is RefundRole {
  return (REFUND_ROLES as readonly string[]).includes(role);
}

/**
 * - auditor: read-only
 * - agent: approve/reject refunds up to the approval limit
 * - finance_approver: approve/reject any amount, and mark approved refunds as paid
 * - nobody may approve or reject a refund they requested themselves (two-person rule)
 */
export function checkPermission(user: Actor, action: RefundAction, refund: Pick<RefundRequest, "amountCents" | "requestedBy">): Decision {
  if (!isRefundRole(user.role)) return deny(`Role '${user.role}' has no access to refunds`);
  if (user.role === "auditor") return deny("Auditors have read-only access");
  if (action === "mark_paid") {
    return user.role === "finance_approver" ? allow() : deny("Only finance approvers can mark refunds as paid");
  }
  if (DECISION_ACTIONS.includes(action)) {
    if (refund.amountCents > APPROVAL_LIMIT_CENTS && user.role !== "finance_approver") {
      return deny(`Refunds over ${formatMoney(APPROVAL_LIMIT_CENTS)} need a finance approver`);
    }
    if (refund.requestedBy === user.id) return deny("You can't decide a refund you requested (two-person rule)");
  }
  return allow();
}

/** Actions the UI should offer. The API re-checks all of this independently. */
export function allowedActions(user: Actor, refund: RefundRequest): RefundAction[] {
  return REFUND_ACTIONS.filter((a) => nextStatus(refund.status, a) !== null && checkPermission(user, a, refund).allowed);
}
