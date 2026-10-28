export const KYC_APP = "kyc";

export const KYC_ROLES = ["reviewer", "senior_reviewer", "auditor"] as const;
export type KycRole = (typeof KYC_ROLES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CASE_STATUSES = ["pending", "in_review", "approved", "rejected", "info_requested"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_ACTIONS = ["claim", "approve", "reject", "request_info", "customer_replied"] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

export const DECISION_ACTIONS: readonly CaseAction[] = ["approve", "reject", "request_info"];

export const ID_DOCUMENT_STATUSES = ["verified", "expired", "unreadable", "suspected_tampering"] as const;
export const SANCTIONS_RESULTS = ["clear", "potential_match", "pep_match"] as const;

export const REJECTION_REASONS = {
  DOCUMENT_TAMPERED: "ID document appears tampered or forged",
  DOCUMENT_EXPIRED: "ID document expired",
  IDENTITY_MISMATCH: "Identity details do not match",
  SELFIE_MISMATCH: "Selfie does not match ID photo",
  SANCTIONS_HIT: "Confirmed sanctions / watchlist match",
  INCOMPLETE_INFORMATION: "Customer did not provide required information",
  OTHER: "Other (explain in note)",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

export const ACTION_LABELS: Record<CaseAction, string> = {
  claim: "Claim",
  approve: "Approve",
  reject: "Reject",
  request_info: "Request info",
  customer_replied: "Customer replied",
};
