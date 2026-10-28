import { REFUND_ACTIONS, type RefundAction, type RefundStatus } from "@/apps/refunds/domain/constants";

export const TRANSITIONS: Record<RefundAction, { from: RefundStatus; to: RefundStatus }> = {
  approve: { from: "requested", to: "approved" },
  reject: { from: "requested", to: "rejected" },
  mark_paid: { from: "approved", to: "paid" },
};

export const TERMINAL_STATUSES: readonly RefundStatus[] = ["rejected", "paid"];

export function nextStatus(from: RefundStatus, action: RefundAction): RefundStatus | null {
  const t = TRANSITIONS[action];
  return t.from === from ? t.to : null;
}

export function isRefundAction(v: unknown): v is RefundAction {
  return typeof v === "string" && (REFUND_ACTIONS as readonly string[]).includes(v);
}
