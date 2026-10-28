import Link from "next/link";
import { StatusBadge } from "@/platform/ui/StatusBadge";
import { LogoutButton } from "@/apps/kyc/components/LogoutButton";
import { requirePageUser } from "@/apps/kyc/session";

export default async function KycLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link href="/kyc" className="font-semibold">KYC Review Queue</Link>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">prototype</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/kyc" className="hover:text-slate-900">Queue</Link>
            <Link href="/kyc/audit" className="hover:text-slate-900">Audit log</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>{user.name}</span>
            <StatusBadge label={user.role} tone={user.role === "auditor" ? "accent" : user.role === "senior_reviewer" ? "info" : "neutral"} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
