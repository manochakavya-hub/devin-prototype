import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Db } from "@/platform/db/client";
import { appendAudit } from "@/platform/audit/log";
import { HttpError, readJson, withErrors } from "@/platform/http/errors";
import { users, type User } from "@/platform/auth/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "@/platform/auth/session";

export function getUserById(db: Db, id: string): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(db: Db): User[] {
  return db.select().from(users).orderBy(asc(users.role), asc(users.name)).all();
}

function userFromToken(db: Db, token: string | undefined): User | null {
  const userId = verifySessionToken(token);
  return userId ? (getUserById(db, userId) ?? null) : null;
}

/** For API routes. Throws 401 if there is no valid session. */
export function requireUser(db: Db, req: NextRequest): User {
  const user = userFromToken(db, req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new HttpError(401, "unauthenticated", "Not logged in");
  return user;
}

/** For server components. */
export async function getCurrentUser(db: Db): Promise<User | null> {
  const store = await cookies();
  return userFromToken(db, store.get(SESSION_COOKIE)?.value);
}

export function devLoginEnabled(): boolean {
  if (process.env.ENABLE_DEV_LOGIN) return process.env.ENABLE_DEV_LOGIN === "true";
  return process.env.NODE_ENV !== "production";
}

/** Mock login: pick any seeded user. Replace with an OIDC callback before production. */
export function createLoginHandler(getDb: () => Db) {
  return withErrors(async (req: NextRequest) => {
    if (!devLoginEnabled()) throw new HttpError(404, "not_found", "Dev login is disabled");
    const db = getDb();
    const body = await readJson(req);
    const user = typeof body.userId === "string" ? getUserById(db, body.userId) : undefined;
    if (!user) throw new HttpError(400, "unknown_user", "Unknown user");

    appendAudit(db, { actorUserId: user.id, action: "login", metadata: { method: "dev_login" } });
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  });
}

export function createLogoutHandler() {
  return withErrors(async () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  });
}
