import { redirect } from "next/navigation";
import { getCurrentAppUser, getCurrentUser } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { getDb } from "@/apps/flags/db";
import { FLAGS_APP } from "@/apps/flags/domain/constants";

/** For flags server components: login if there's no session, the app launcher if the user has no flags role. */
export async function requirePageUser(): Promise<AppUser> {
  const db = getDb();
  const user = await getCurrentAppUser(db, FLAGS_APP);
  if (user) return user;
  redirect((await getCurrentUser(db)) ? "/?denied=flags" : "/login");
}
