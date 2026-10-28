import { StatusBadge, type BadgeTone } from "@/platform/ui/StatusBadge";
import type { RefundStatus } from "@/apps/refunds/domain/constants";

const TONE: Record<RefundStatus, BadgeTone> = { requested: "warning", approved: "info", rejected: "danger", paid: "success" };

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return <StatusBadge label={status} tone={TONE[status]} />;
}
