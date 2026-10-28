import { StatusBadge } from "@/platform/ui/StatusBadge";

export function OnOffBadge({ on, archived }: { on: boolean; archived?: boolean }) {
  if (archived) return <StatusBadge label="archived" tone="neutral" />;
  return <StatusBadge label={on ? "on" : "off"} tone={on ? "success" : "neutral"} />;
}
