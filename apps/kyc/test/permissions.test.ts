import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import type { KycCase } from "@/apps/kyc/db/schema";
import { allowedActions } from "@/apps/kyc/domain/permissions";
import { getCase, performCaseAction } from "@/apps/kyc/domain/service";
import { U, auditRows, createTestDb, insertCase } from "@/apps/kyc/test/fixtures";

let db: Db;
beforeEach(() => (db = createTestDb()));

const decide = (user: (typeof U)[keyof typeof U], c: KycCase, action: "approve" | "reject" | "request_info" = "approve") =>
  performCaseAction(db, user, c.id, { action, reasonCode: "OTHER", note: "n" });

describe("reviewer", () => {
  it.each(["low", "medium"] as const)("can claim and decide %s risk cases", (riskLevel) => {
    for (const action of ["approve", "reject", "request_info"] as const) {
      const c = insertCase(db, { riskLevel });
      expect(performCaseAction(db, U.reviewer, c.id, { action: "claim" }).ok).toBe(true);
      expect(decide(U.reviewer, getCase(db, c.id)!, action).ok).toBe(true);
    }
  });

  it("cannot claim a high risk case (403, logged as denied)", () => {
    const c = insertCase(db, { riskLevel: "high" });
    const r = performCaseAction(db, U.reviewer, c.id, { action: "claim" });
    expect(r).toMatchObject({ ok: false, error: { status: 403, code: "forbidden" } });
    expect(getCase(db, c.id)!.status).toBe("pending");
    expect(auditRows(db)).toMatchObject([{ action: "denied", actorUserId: U.reviewer.id, caseId: c.id, metadata: { attempted_action: "claim" } }]);
  });

  it.each(["approve", "reject", "request_info"] as const)(
    "cannot %s a high risk case even when assigned to them (e.g. risk escalated after claim)",
    (action) => {
      const c = insertCase(db, { riskLevel: "high", status: "in_review", assignedTo: U.reviewer.id });
      const r = decide(U.reviewer, c, action);
      expect(r).toMatchObject({ ok: false, error: { status: 403, message: "High-risk cases can only be decided by a senior reviewer" } });
      expect(getCase(db, c.id)!.status).toBe("in_review");
      const rows = auditRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: "denied", fromStatus: "in_review", toStatus: null, metadata: { attempted_action: action, risk_level: "high", role: "reviewer" } });
    },
  );

  it("cannot decide a case claimed by someone else (403, logged)", () => {
    const c = insertCase(db, { status: "in_review", assignedTo: U.reviewer2.id });
    expect(decide(U.reviewer, c)).toMatchObject({ ok: false, error: { status: 403, message: "You can only decide cases you have claimed" } });
    expect(auditRows(db)).toMatchObject([{ action: "denied" }]);
  });
});

describe("senior_reviewer", () => {
  it("can claim and decide high risk cases", () => {
    const c = insertCase(db, { riskLevel: "high" });
    expect(performCaseAction(db, U.senior, c.id, { action: "claim" }).ok).toBe(true);
    expect(decide(U.senior, getCase(db, c.id)!).ok).toBe(true);
    expect(getCase(db, c.id)!.status).toBe("approved");
  });

  it("still cannot decide a case claimed by someone else", () => {
    const c = insertCase(db, { status: "in_review", assignedTo: U.reviewer.id });
    expect(decide(U.senior, c)).toMatchObject({ ok: false, error: { status: 403 } });
  });
});

describe("auditor", () => {
  it.each(["claim", "approve", "reject", "request_info", "customer_replied"] as const)("is denied %s and it is logged", (action) => {
    const status = action === "claim" ? "pending" : action === "customer_replied" ? "info_requested" : "in_review";
    const c = insertCase(db, { status, assignedTo: status === "pending" ? null : U.auditor.id });
    const r = performCaseAction(db, U.auditor, c.id, { action, reasonCode: "OTHER", note: "n" });
    expect(r).toMatchObject({ ok: false, error: { status: 403, message: "Auditors have read-only access" } });
    expect(getCase(db, c.id)!.status).toBe(status);
    expect(auditRows(db)).toMatchObject([{ action: "denied", actorUserId: U.auditor.id }]);
  });
});

describe("unknown roles", () => {
  it("are denied everything", () => {
    const c = insertCase(db);
    const r = performCaseAction(db, { id: U.reviewer.id, role: "admin" }, c.id, { action: "claim" });
    expect(r).toMatchObject({ ok: false, error: { status: 403 } });
  });
});

describe("allowedActions (what the UI shows)", () => {
  it("matches role, state and ownership", () => {
    const pendingHigh = insertCase(db, { riskLevel: "high" });
    const mine = insertCase(db, { status: "in_review", assignedTo: U.reviewer.id });
    const waiting = insertCase(db, { status: "info_requested", assignedTo: U.reviewer.id });
    expect(allowedActions(U.reviewer, pendingHigh)).toEqual([]);
    expect(allowedActions(U.senior, pendingHigh)).toEqual(["claim"]);
    expect(allowedActions(U.reviewer, mine)).toEqual(["approve", "reject", "request_info"]);
    expect(allowedActions(U.reviewer2, mine)).toEqual([]);
    expect(allowedActions(U.reviewer2, waiting)).toEqual(["customer_replied"]);
    for (const c of [pendingHigh, mine, waiting]) expect(allowedActions(U.auditor, c)).toEqual([]);
  });
});
