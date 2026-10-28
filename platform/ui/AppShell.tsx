import Link from "next/link";
import { LogoutButton } from "@/platform/auth/LogoutButton";
import { StatusBadge, type BadgeTone } from "@/platform/ui/StatusBadge";

type Props = {
  title: string;
  homeHref: string;
  nav: { href: string; label: string }[];
  user: { name: string; role: string };
  roleTone?: BadgeTone;
  children: React.ReactNode;
};

/** Header (app name, nav, current user + role, switch user) and page container shared by internal apps. */
export function AppShell({ title, homeHref, nav, user, roleTone = "neutral", children }: Props) {
  return (
    <div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900" title="All apps">⌂</Link>
          <Link href={homeHref} className="font-semibold">{title}</Link>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">prototype</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            {nav.map((n) => <Link key={n.href} href={n.href} className="hover:text-slate-900">{n.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>{user.name}</span>
            <StatusBadge label={user.role} tone={roleTone} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
