import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, listUserRoles } from "@/platform/auth/server";
import { LogoutButton } from "@/platform/auth/LogoutButton";
import { getHomeDb } from "@/apps/home/db";
import { APPS } from "@/apps/registry";

export default async function HomePage({ denied }: { denied?: string }) {
  const db = getHomeDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const roles = new Map(listUserRoles(db, user.id).map((r) => [r.app, r.role]));
  const deniedApp = APPS.find((a) => a.id === denied);

  return (
    <main className="mx-auto mt-16 max-w-2xl px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Internal tools</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.name}</span>
          <LogoutButton />
        </div>
      </div>
      {deniedApp && (
        <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          You don&apos;t have a role in {deniedApp.name}.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {APPS.map((app) => {
          const role = roles.get(app.id);
          const body = (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium">{app.name}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{role ?? "no access"}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{app.description}</p>
            </>
          );
          return (
            <li key={app.id}>
              {role ? (
                <Link href={app.href} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400">{body}</Link>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 opacity-60">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
