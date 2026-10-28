import { CASE_ACTIONS, type CaseAction, type CaseStatus } from "@/apps/kyc/domain/constants";

/** Every action is valid from exactly one status. Anything not listed here is an invalid transition. */
export const TRANSITIONS: Record<CaseAction, { from: CaseStatus; to: CaseStatus }> = {
  claim: { from: "pending", to: "in_review" },
  approve: { from: "in_review", to: "approved" },
  reject: { from: "in_review", to: "rejected" },
  request_info: { from: "in_review", to: "info_requested" },
  customer_replied: { from: "info_requested", to: "pending" },
};

export const TERMINAL_STATUSES: readonly CaseStatus[] = ["approved", "rejected"];

export function nextStatus(from: CaseStatus, action: CaseAction): CaseStatus | null {
  const t = TRANSITIONS[action];
  return t && t.from === from ? t.to : null;
}

export function isCaseAction(value: unknown): value is CaseAction {
  return typeof value === "string" && (CASE_ACTIONS as readonly string[]).includes(value);
}
