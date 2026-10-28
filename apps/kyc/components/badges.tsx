import { StatusBadge, type BadgeTone } from "@/platform/ui/StatusBadge";
import type { CaseStatus, RiskLevel } from "@/apps/kyc/domain/constants";

const STATUS_TONE: Record<CaseStatus, BadgeTone> = {
  pending: "warning",
  in_review: "info",
  info_requested: "accent",
  approved: "success",
  rejected: "danger",
};
const RISK_TONE: Record<RiskLevel, BadgeTone> = { low: "neutral", medium: "warning", high: "danger" };

export const statusLabel = (s: CaseStatus) => s.replace("_", " ");

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <StatusBadge label={statusLabel(status)} tone={STATUS_TONE[status]} />;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <StatusBadge label={`${risk} risk`} tone={RISK_TONE[risk]} />;
}
