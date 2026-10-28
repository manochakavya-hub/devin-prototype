import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Db } from "@/platform/db/client";
import { appendAudit, recordDenied } from "@/platform/audit/log";
import { HttpError, readJson, withErrors } from "@/platform/http/errors";
import { userRoles, users, type AppUser, type User } from "@/platform/auth/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "@/platform/auth/session";

export function getUserById(db: Db, id: string): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function listUsers(db: Db): User[] {
  return db.select().from(users).orderBy(asc(users.name)).all();
}

export function getAppRole(db: Db, userId: string, app: string): string | null {
  return db.select({ role: userRoles.role }).from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.app, app))).get()?.role ?? null;
}

/** All roles a user holds, e.g. [{ app: "kyc", role: "reviewer" }, { app: "refunds", role: "agent" }]. */
export function listUserRoles(db: Db, userId: string): { app: string; role: string }[] {
  return db.select({ app: userRoles.app, role: userRoles.role }).from(userRoles)
    .where(eq(userRoles.userId, userId)).orderBy(asc(userRoles.app)).all();
}

/** Every user with all of their app roles (for the dev login screen). */
export function listUsersWithRoles(db: Db): (User & { roles: { app: string; role: string }[] })[] {
  return db.select().from(users).orderBy(asc(users.name)).all()
    .map((u) => ({ ...u, roles: listUserRoles(db, u.id) }));
}

/** Users who have a role in one app. */
export function listAppUsers(db: Db, app: string): AppUser[] {
  return db.select({ id: users.id, email: users.email, name: users.name, app: userRoles.app, role: userRoles.role })
    .from(users).innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(userRoles.app, app)).orderBy(asc(userRoles.role), asc(users.name)).all();
}

function userFromToken(db: Db, token: string | undefined): User | null {
  const userId = verifySessionToken(token);
  return userId ? (getUserById(db, userId) ?? null) : null;
}

function toAppUser(db: Db, user: User, app: string): AppUser | null {
  const role = getAppRole(db, user.id, app);
  return role ? { ...user, app, role } : null;
}

/** For API routes. Throws 401 if there is no valid session. */
export function requireUser(db: Db, req: NextRequest): User {
  const user = userFromToken(db, req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new HttpError(401, "unauthenticated", "Not logged in");
  return user;
}

/**
 * For API routes of one app. Throws 401 without a valid session, and 403 (logged as "denied")
 * if the user has no role in this app. The role is re-read from the DB on every request.
 */
export function requireAppUser(db: Db, req: NextRequest, app: string): AppUser {
  const user = requireUser(db, req);
  const appUser = toAppUser(db, user, app);
  if (!appUser) {
    const reason = `No access to the '${app}' app`;
    recordDenied(db, { app, actorUserId: user.id, attemptedAction: "access", reason, metadata: { path: req.nextUrl.pathname } });
    throw new HttpError(403, "forbidden", reason);
  }
  return appUser;
}

/** For server components. */
export async function getCurrentUser(db: Db): Promise<User | null> {
  const store = await cookies();
  return userFromToken(db, store.get(SESSION_COOKIE)?.value);
}

/** For server components of one app: null if not logged in or no role in the app. */
export async function getCurrentAppUser(db: Db, app: string): Promise<AppUser | null> {
  const user = await getCurrentUser(db);
  return user ? toAppUser(db, user, app) : null;
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
    const res = NextResponse.json({ user, roles: listUserRoles(db, user.id) });
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
