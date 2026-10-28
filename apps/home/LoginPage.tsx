import { redirect } from "next/navigation";
import { LoginScreen } from "@/platform/auth/LoginScreen";
import { devLoginEnabled, getCurrentUser, listUsersWithRoles } from "@/platform/auth/server";
import { getHomeDb } from "@/apps/home/db";

export default async function LoginPage() {
  const db = getHomeDb();
  if (await getCurrentUser(db)) redirect("/");
  if (!devLoginEnabled()) return <main className="p-8">Dev login is disabled in this environment.</main>;
  return <LoginScreen appName="Internal tools" users={listUsersWithRoles(db)} redirectTo="/" />;
}
