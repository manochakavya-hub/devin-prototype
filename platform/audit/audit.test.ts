import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/platform/db/client";
import { USERS_DDL, users } from "@/platform/auth/schema";
import { AUDIT_DDL, auditLog } from "@/platform/audit/schema";
import { appendAudit, queryAudit, recordDenied } from "@/platform/audit/log";

let db: Db;

/** Drizzle wraps driver errors; the SQLite trigger message lives on `cause`. */
function sqliteError(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  return "did not throw";
}

beforeEach(() => {
  db = openDb(":memory:", [USERS_DDL, AUDIT_DDL]);
  db.insert(users).values({ id: "u1", email: "u1@example.com", name: "User One" }).run();
  appendAudit(db, { actorUserId: "u1", action: "claim", caseId: "C-1", fromStatus: "pending", toStatus: "in_review", metadata: { a: 1 } });
});

describe("audit_log append-only triggers", () => {
  it("allows INSERT", () => {
    appendAudit(db, { actorUserId: "u1", action: "approve", caseId: "C-1" });
    expect(queryAudit(db)).toHaveLength(2);
  });

  it("blocks UPDATE via raw SQL", () => {
    expect(sqliteError(() => db.run(sql`UPDATE audit_log SET action = 'tampered'`))).toMatch(/append-only: UPDATE/);
    expect(queryAudit(db)[0].action).toBe("claim");
  });

  it("blocks UPDATE via the ORM", () => {
    expect(sqliteError(() => db.update(auditLog).set({ reason: "edited" }).where(eq(auditLog.id, 1)).run())).toMatch(/append-only: UPDATE/);
  });

  it("blocks DELETE", () => {
    expect(sqliteError(() => db.run(sql`DELETE FROM audit_log`))).toMatch(/append-only: DELETE/);
    expect(sqliteError(() => db.delete(auditLog).where(eq(auditLog.id, 1)).run())).toMatch(/append-only: DELETE/);
    expect(queryAudit(db)).toHaveLength(1);
  });

  it("blocks INSERT OR REPLACE over an existing row (REPLACE deletes first)", () => {
    // SQLite skips DELETE triggers on REPLACE unless recursive_triggers is on, so a dedicated trigger guards this.
    expect(
      sqliteError(() => db.run(sql`INSERT OR REPLACE INTO audit_log (id, timestamp, actor_user_id, action) VALUES (1, 'x', 'u1', 'forged')`)),
    ).toMatch(/append-only: overwriting/);
    const row = db.select().from(auditLog).where(eq(auditLog.id, 1)).get();
    expect(row?.action).toBe("claim");
  });
});

describe("audit helpers", () => {
  it("records denials with the attempted action in metadata", () => {
    recordDenied(db, { actorUserId: "u1", attemptedAction: "approve", reason: "nope", caseId: "C-1" });
    const [row] = queryAudit(db, { action: "denied" });
    expect(row).toMatchObject({ action: "denied", reason: "nope", caseId: "C-1", actorName: "User One" });
    expect(row.metadata).toEqual({ attempted_action: "approve" });
  });

  it("filters by actor, case and action", () => {
    appendAudit(db, { actorUserId: "u1", action: "approve", caseId: "C-2" });
    expect(queryAudit(db, { caseId: "C-2" })).toHaveLength(1);
    expect(queryAudit(db, { action: "claim" })).toHaveLength(1);
    expect(queryAudit(db, { actorUserId: "nobody" })).toHaveLength(0);
  });

  it("rejects invalid JSON metadata at the DB level", () => {
    expect(() => db.run(sql`INSERT INTO audit_log (timestamp, actor_user_id, action, metadata) VALUES ('t', 'u1', 'x', 'not json')`)).toThrow();
  });
});
