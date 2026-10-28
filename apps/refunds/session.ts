import { redirect } from "next/navigation";
import { getCurrentAppUser, getCurrentUser } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { getDb } from "@/apps/refunds/db";
import { REFUNDS_APP } from "@/apps/refunds/domain/constants";

/** For refunds server components: login if there's no session, the app launcher if the user has no refunds role. */
export async function requirePageUser(): Promise<AppUser> {
  const db = getDb();
  const user = await getCurrentAppUser(db, REFUNDS_APP);
  if (user) return user;
  redirect((await getCurrentUser(db)) ? "/?denied=refunds" : "/login");
}
