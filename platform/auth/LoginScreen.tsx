"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginUser = { id: string; name: string; email: string; roles: { app: string; role: string }[] };

export function LoginScreen({ users, appName, redirectTo }: { users: LoginUser[]; appName: string; redirectTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(userId: string) {
    setBusy(userId);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      router.replace(redirectTo);
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Login failed");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto mt-20 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{appName}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Development login. Pick a seeded user. There is no password: this screen stands in for SSO.
      </p>
      <ul className="mt-5 space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => login(u.id)}
              className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
            >
              <span>
                <span className="block font-medium">{u.name}</span>
                <span className="block text-xs text-slate-500">{u.email}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                {busy === u.id ? (
                  <span className="font-mono text-xs text-slate-500">signing in…</span>
                ) : u.roles.length ? (
                  u.roles.map((r) => (
                    <span key={r.app} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{r.app}: {r.role}</span>
                  ))
                ) : (
                  <span className="font-mono text-xs text-slate-400">no app roles</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
