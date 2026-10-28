import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { openDb } from "@/platform/db/client";
import { USERS_DDL, userRoles, users } from "@/platform/auth/schema";
import { AUDIT_DDL, auditLog } from "@/platform/audit/schema";
import { getAppRole, listAppUsers, listUserRoles, listUsersWithRoles, requireAppUser } from "@/platform/auth/server";
import { HttpError } from "@/platform/http/errors";
import { SESSION_COOKIE, createSessionToken } from "@/platform/auth/session";

function setup() {
  const db = openDb(":memory:", [USERS_DDL, AUDIT_DDL]);
  db.insert(users).values([
    { id: "a", email: "a@example.com", name: "Ann" },
    { id: "b", email: "b@example.com", name: "Bob" },
  ]).run();
  db.insert(userRoles).values([
    { userId: "a", app: "app1", role: "editor" },
    { userId: "a", app: "app2", role: "viewer" },
    { userId: "b", app: "app2", role: "admin" },
  ]).run();
  return db;
}

const req = (userId?: string) =>
  new NextRequest("http://localhost/api/app1/things", { headers: userId ? { cookie: `${SESSION_COOKIE}=${createSessionToken(userId)}` } : {} });

describe("per-app roles", () => {
  it("resolves a different role per app and null where the user has none", () => {
    const db = setup();
    expect(getAppRole(db, "a", "app1")).toBe("editor");
    expect(getAppRole(db, "a", "app2")).toBe("viewer");
    expect(getAppRole(db, "b", "app1")).toBeNull();
    expect(listUserRoles(db, "a")).toEqual([{ app: "app1", role: "editor" }, { app: "app2", role: "viewer" }]);
    expect(listAppUsers(db, "app2").map((u) => [u.id, u.role])).toEqual([["b", "admin"], ["a", "viewer"]]);
    expect(listUsersWithRoles(db).find((u) => u.id === "b")?.roles).toEqual([{ app: "app2", role: "admin" }]);
  });

  it("allows only one role per user per app", () => {
    const db = setup();
    expect(() => db.insert(userRoles).values({ userId: "a", app: "app1", role: "admin" }).run()).toThrow();
  });

  it("requireAppUser returns the app role, 401s without a session and 403s (logged) without a role", () => {
    const db = setup();
    expect(requireAppUser(db, req("a"), "app1")).toMatchObject({ id: "a", app: "app1", role: "editor" });
    expect(() => requireAppUser(db, req(), "app1")).toThrow(expect.objectContaining({ status: 401 }) as HttpError);
    expect(() => requireAppUser(db, req("b"), "app1")).toThrow(expect.objectContaining({ status: 403 }) as HttpError);
    const rows = db.select().from(auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ app: "app1", actorUserId: "b", action: "denied", metadata: { attempted_action: "access" } });
  });
});
