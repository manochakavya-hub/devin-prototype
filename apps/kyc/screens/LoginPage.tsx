import { redirect } from "next/navigation";
import { LoginScreen } from "@/platform/auth/LoginScreen";
import { devLoginEnabled, getCurrentUser, listUsers } from "@/platform/auth/server";
import { getDb } from "@/apps/kyc/db";

export default async function LoginPage() {
  const db = getDb();
  if (await getCurrentUser(db)) redirect("/kyc");
  if (!devLoginEnabled()) return <main className="p-8">Dev login is disabled in this environment.</main>;
  return <LoginScreen appName="KYC Review Queue" users={listUsers(db)} redirectTo="/kyc" />;
}
