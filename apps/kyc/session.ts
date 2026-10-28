import { redirect } from "next/navigation";
import { getCurrentAppUser, getCurrentUser } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { getDb } from "@/apps/kyc/db";
import { KYC_APP } from "@/apps/kyc/domain/constants";

/** For KYC server components: login if there's no session, the app launcher if the user has no KYC role. */
export async function requirePageUser(): Promise<AppUser> {
  const db = getDb();
  const user = await getCurrentAppUser(db, KYC_APP);
  if (user) return user;
  redirect((await getCurrentUser(db)) ? "/?denied=kyc" : "/login");
}
