import { allow, deny, type Decision } from "@/platform/auth/policy";
import type { KycCase } from "@/apps/kyc/db/schema";
import { CASE_ACTIONS, DECISION_ACTIONS, KYC_ROLES, type CaseAction, type KycRole } from "@/apps/kyc/domain/constants";
import { nextStatus } from "@/apps/kyc/domain/stateMachine";

type Actor = { id: string; role: string };

export function isKycRole(role: string): role is KycRole {
  return (KYC_ROLES as readonly string[]).includes(role);
}

export function isDecision(action: CaseAction): boolean {
  return DECISION_ACTIONS.includes(action);
}

/** All three KYC roles can read cases and the audit log. */
export function canViewCases(user: Actor): Decision {
  return isKycRole(user.role) ? allow() : deny(`Role '${user.role}' has no access to KYC cases`);
}

/** Is this role allowed to perform this kind of action on a case of this risk level? */
export function checkRolePermission(user: Actor, action: CaseAction, kase: Pick<KycCase, "riskLevel">): Decision {
  if (!isKycRole(user.role)) return deny(`Role '${user.role}' has no access to KYC cases`);
  if (user.role === "auditor") return deny("Auditors have read-only access");
  if (kase.riskLevel === "high" && user.role !== "senior_reviewer") {
    if (action === "claim") return deny("High-risk cases can only be claimed by a senior reviewer");
    if (isDecision(action)) return deny("High-risk cases can only be decided by a senior reviewer");
  }
  return allow();
}

/** Decisions may only be made by the person who claimed the case. */
export function checkOwnership(user: Actor, action: CaseAction, kase: Pick<KycCase, "assignedTo">): Decision {
  if (isDecision(action) && kase.assignedTo !== user.id) return deny("You can only decide cases you have claimed");
  return allow();
}

/** Actions the UI should offer. The API re-checks all of this independently. */
export function allowedActions(user: Actor, kase: KycCase): CaseAction[] {
  return CASE_ACTIONS.filter(
    (a) => checkRolePermission(user, a, kase).allowed && nextStatus(kase.status, a) !== null && checkOwnership(user, a, kase).allowed,
  );
}
