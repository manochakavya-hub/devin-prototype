import { AppShell } from "@/platform/ui/AppShell";
import { requirePageUser } from "@/apps/flags/session";

export default async function FlagsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell
      title="Feature flags"
      homeHref="/flags"
      nav={[{ href: "/flags", label: "Flags" }, { href: "/flags/audit", label: "Audit log" }]}
      user={user}
      roleTone={user.role === "auditor" ? "accent" : user.role === "release_manager" ? "info" : "neutral"}
    >
      {children}
    </AppShell>
  );
}
