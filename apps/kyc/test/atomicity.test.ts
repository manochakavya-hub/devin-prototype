import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { getCase, performCaseAction } from "@/apps/kyc/domain/service";
import { U, auditRows, createTestDb, insertCase } from "@/apps/kyc/test/fixtures";

let db: Db;
beforeEach(() => (db = createTestDb()));

describe("audit row is written atomically with the state change", () => {
  it("writes exactly one matching audit row per change, with the same timestamp as updated_at", () => {
    const c = insertCase(db);
    const r = performCaseAction(db, U.reviewer, c.id, { action: "claim" });
    expect(r.ok).toBe(true);
    const after = getCase(db, c.id)!;
    const rows = auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "claim", caseId: c.id, actorUserId: U.reviewer.id, fromStatus: "pending", toStatus: "in_review", timestamp: after.updatedAt });
    expect(r.ok && r.auditId).toBe(rows[0].id);
  });

  it("rolls back the state change when the audit insert fails", () => {
    const c = insertCase(db);
    // Simulate an audit write failure at the database level.
    db.run(sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);

    expect(() => performCaseAction(db, U.reviewer, c.id, { action: "claim" })).toThrow();

    const after = getCase(db, c.id)!;
    expect(after.status).toBe("pending");
    expect(after.assignedTo).toBeNull();
    expect(after.updatedAt).toBe(c.updatedAt);
    expect(auditRows(db)).toHaveLength(0);
  });

  it("rolls back a decision too (reject), leaving the case claimable/decidable afterwards", () => {
    const c = insertCase(db, { status: "in_review", assignedTo: U.reviewer.id });
    db.run(sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);
    expect(() => performCaseAction(db, U.reviewer, c.id, { action: "reject", reasonCode: "OTHER", note: "x" })).toThrow();
    expect(getCase(db, c.id)!.status).toBe("in_review");

    db.run(sql`DROP TRIGGER fail_audit`);
    expect(performCaseAction(db, U.reviewer, c.id, { action: "reject", reasonCode: "OTHER", note: "x" }).ok).toBe(true);
    expect(auditRows(db)).toHaveLength(1);
  });
});
