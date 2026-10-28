import { redirect } from "next/navigation";
import { getCurrentUser } from "@/platform/auth/server";
import type { User } from "@/platform/auth/schema";
import { getDb } from "@/apps/kyc/db";
import { isKycRole } from "@/apps/kyc/domain/permissions";

/** For KYC server components: redirects to login if there's no valid session or the role has no KYC access. */
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser(getDb());
  if (!user || !isKycRole(user.role)) redirect("/login");
  return user;
}
