import { AppShell } from "@/platform/ui/AppShell";
import { requirePageUser } from "@/apps/refunds/session";

export default async function RefundsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell
      title="Refunds"
      homeHref="/refunds"
      nav={[{ href: "/refunds", label: "Requests" }, { href: "/refunds/audit", label: "Audit log" }]}
      user={user}
      roleTone={user.role === "auditor" ? "accent" : user.role === "finance_approver" ? "info" : "neutral"}
    >
      {children}
    </AppShell>
  );
}
