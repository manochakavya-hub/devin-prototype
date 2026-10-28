import { AppShell } from "@/platform/ui/AppShell";
import { requirePageUser } from "@/apps/kyc/session";

export default async function KycLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell
      title="KYC Review Queue"
      homeHref="/kyc"
      nav={[{ href: "/kyc", label: "Queue" }, { href: "/kyc/audit", label: "Audit log" }]}
      user={user}
      roleTone={user.role === "auditor" ? "accent" : user.role === "senior_reviewer" ? "info" : "neutral"}
    >
      {children}
    </AppShell>
  );
}
