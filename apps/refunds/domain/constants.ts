export const REFUNDS_APP = "refunds";

export const REFUND_ROLES = ["agent", "finance_approver", "auditor"] as const;
export type RefundRole = (typeof REFUND_ROLES)[number];

export const REFUND_STATUSES = ["requested", "approved", "rejected", "paid"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_ACTIONS = ["approve", "reject", "mark_paid"] as const;
export type RefundAction = (typeof REFUND_ACTIONS)[number];

export const DECISION_ACTIONS: readonly RefundAction[] = ["approve", "reject"];

/** Agents may decide refunds up to and including this amount; above it needs a finance approver. */
export const APPROVAL_LIMIT_CENTS = 50_000;
export const CURRENCY = "USD";

export const REFUND_CATEGORIES = {
  damaged_item: "Item arrived damaged",
  not_delivered: "Order never delivered",
  duplicate_charge: "Charged twice",
  cancelled_subscription: "Cancelled subscription still billed",
  wrong_item: "Wrong item sent",
} as const;
export type RefundCategory = keyof typeof REFUND_CATEGORIES;

export const REJECTION_REASONS = {
  OUTSIDE_REFUND_WINDOW: "Outside the refund window",
  ITEM_NOT_RETURNED: "Item was not returned",
  DUPLICATE_REQUEST: "Duplicate of another refund request",
  ALREADY_REFUNDED: "Already refunded",
  SUSPECTED_FRAUD: "Suspected fraud",
  OTHER: "Other (explain in note)",
} as const;
export type RefundRejectionReason = keyof typeof REJECTION_REASONS;

export const ACTION_LABELS: Record<RefundAction, string> = {
  approve: "Approve",
  reject: "Reject",
  mark_paid: "Mark as paid",
};

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(cents / 100);
}
