import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/platform/db/client";
import { ALL_DDL } from "@/apps/refunds/db";
import { APPROVAL_LIMIT_CENTS, REFUND_ACTIONS } from "@/apps/refunds/domain/constants";
import { allowedActions } from "@/apps/refunds/domain/permissions";
import { TERMINAL_STATUSES, nextStatus } from "@/apps/refunds/domain/stateMachine";
import { applyRefundTransition, getRefund, performRefundAction } from "@/apps/refunds/domain/service";
import { KYC_ONLY, R, auditRows, createTestDb, insertRefund } from "@/apps/refunds/test/fixtures";

let db: Db;
beforeEach(() => (db = createTestDb()));

describe("refund state machine", () => {
  it("allows requested -> approved | rejected and approved -> paid only", () => {
    expect(nextStatus("requested", "approve")).toBe("approved");
    expect(nextStatus("requested", "reject")).toBe("rejected");
    expect(nextStatus("approved", "mark_paid")).toBe("paid");
    expect(nextStatus("requested", "mark_paid")).toBeNull();
    expect(nextStatus("approved", "approve")).toBeNull();
    for (const s of TERMINAL_STATUSES) for (const a of REFUND_ACTIONS) expect(nextStatus(s, a)).toBeNull();
  });

  it("full lifecycle writes one audit row per step, tagged with the app", () => {
    const r = insertRefund(db);
    expect(performRefundAction(db, R.agent, r.id, { action: "approve" }).ok).toBe(true);
    expect(performRefundAction(db, R.approver, r.id, { action: "mark_paid" }).ok).toBe(true);
    expect(getRefund(db, r.id)).toMatchObject({ status: "paid", decidedBy: R.agent.id });
    expect(auditRows(db).map((a) => [a.app, a.action, a.fromStatus, a.toStatus])).toEqual([
      ["refunds", "approve", "requested", "approved"],
      ["refunds", "mark_paid", "approved", "paid"],
    ]);
  });

  it("invalid transitions get 409 and log nothing", () => {
    const r = insertRefund(db, { status: "approved" });
    expect(performRefundAction(db, R.approver, r.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 409, code: "invalid_transition" } });
    const p = insertRefund(db, { status: "paid" });
    expect(performRefundAction(db, R.approver, p.id, { action: "reject", reasonCode: "OTHER", note: "x" })).toMatchObject({ ok: false, error: { status: 409 } });
    expect(auditRows(db)).toHaveLength(0);
  });

  it("reject needs a valid reason code and a note (400, nothing logged)", () => {
    const r = insertRefund(db);
    expect(performRefundAction(db, R.agent, r.id, { action: "reject", note: "x" })).toMatchObject({ ok: false, error: { status: 400, code: "invalid_reason_code" } });
    expect(performRefundAction(db, R.agent, r.id, { action: "reject", reasonCode: "SUSPECTED_FRAUD", note: "  " })).toMatchObject({ ok: false, error: { status: 400, code: "note_required" } });
    expect(auditRows(db)).toHaveLength(0);
    expect(performRefundAction(db, R.agent, r.id, { action: "reject", reasonCode: "SUSPECTED_FRAUD", note: "Card flagged" }).ok).toBe(true);
    expect(auditRows(db)[0]).toMatchObject({ reason: "SUSPECTED_FRAUD", metadata: { reason_code: "SUSPECTED_FRAUD", note: "Card flagged" } });
  });
});

describe("refund permissions (enforced in the service, denials logged)", () => {
  it("agent can decide up to and including the limit, not above it", () => {
    const atLimit = insertRefund(db, { amountCents: APPROVAL_LIMIT_CENTS });
    const over = insertRefund(db, { amountCents: APPROVAL_LIMIT_CENTS + 1 });
    expect(performRefundAction(db, R.agent, atLimit.id, { action: "approve" }).ok).toBe(true);
    expect(performRefundAction(db, R.agent, over.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(performRefundAction(db, R.agent, over.id, { action: "reject", reasonCode: "OTHER", note: "x" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(getRefund(db, over.id)!.status).toBe("requested");
    const denied = auditRows(db).filter((a) => a.action === "denied");
    expect(denied).toHaveLength(2);
    expect(denied[0]).toMatchObject({ app: "refunds", caseId: over.id, actorUserId: R.agent.id, reason: "Refunds over $500.00 need a finance approver" });
  });

  it("finance approver can decide any amount", () => {
    const big = insertRefund(db, { amountCents: 2_500_00 });
    expect(performRefundAction(db, R.approver, big.id, { action: "approve" }).ok).toBe(true);
  });

  it("two-person rule: nobody decides a refund they requested, including finance approvers", () => {
    const own = insertRefund(db, { requestedBy: R.approver.id, amountCents: 90_000 });
    expect(performRefundAction(db, R.approver, own.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 403, message: expect.stringMatching(/two-person/) } });
    expect(performRefundAction(db, R.approver2, own.id, { action: "approve" }).ok).toBe(true);
    const agentOwn = insertRefund(db, { requestedBy: R.agent.id });
    expect(performRefundAction(db, R.agent, agentOwn.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 403 } });
  });

  it("only finance approvers can mark as paid", () => {
    const r = insertRefund(db, { status: "approved" });
    expect(performRefundAction(db, R.agent, r.id, { action: "mark_paid" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(performRefundAction(db, R.approver, r.id, { action: "mark_paid" }).ok).toBe(true);
  });

  it("auditor and users without a refunds role are read-only", () => {
    const r = insertRefund(db);
    expect(performRefundAction(db, R.auditor, r.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 403, message: "Auditors have read-only access" } });
    expect(performRefundAction(db, { id: KYC_ONLY.id, role: "reviewer" }, r.id, { action: "approve" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(getRefund(db, r.id)!.status).toBe("requested");
  });

  it("allowedActions matches what the service would allow", () => {
    const small = insertRefund(db);
    const big = insertRefund(db, { amountCents: 90_000 });
    const approved = insertRefund(db, { status: "approved" });
    expect(allowedActions(R.agent, small)).toEqual(["approve", "reject"]);
    expect(allowedActions(R.agent, big)).toEqual([]);
    expect(allowedActions(R.approver, big)).toEqual(["approve", "reject"]);
    expect(allowedActions(R.agent, approved)).toEqual([]);
    expect(allowedActions(R.approver, approved)).toEqual(["mark_paid"]);
    expect(allowedActions(R.auditor, small)).toEqual([]);
  });
});

describe("refund audit atomicity and concurrency", () => {
  it("rolls back the status change when the audit insert fails", () => {
    const r = insertRefund(db);
    db.run(sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);
    expect(() => performRefundAction(db, R.agent, r.id, { action: "approve" })).toThrow();
    expect(getRefund(db, r.id)).toMatchObject({ status: "requested", decidedBy: null });
  });

  it("two approvers acting on the same stale snapshot: only one wins", () => {
    const r = insertRefund(db, { amountCents: 90_000 });
    const a = getRefund(db, r.id)!;
    const b = getRefund(db, r.id)!;
    expect(applyRefundTransition(db, R.approver, a, "approve").ok).toBe(true);
    expect(applyRefundTransition(db, R.approver2, b, "reject", { reasonCode: "OTHER", note: "x" })).toMatchObject({ ok: false, error: { status: 409, code: "conflict" } });
    expect(getRefund(db, r.id)).toMatchObject({ status: "approved", decidedBy: R.approver.id });
    expect(auditRows(db)).toHaveLength(1);
  });

  it("two connections to the same file: exactly one decision succeeds", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refund-race-"));
    try {
      const file = path.join(dir, "race.db");
      const db1 = createTestDb(file);
      const db2 = openDb(file, ALL_DDL);
      const r = insertRefund(db1, { amountCents: 90_000 });
      const results = [
        performRefundAction(db1, R.approver, r.id, { action: "approve" }),
        performRefundAction(db2, R.approver2, r.id, { action: "reject", reasonCode: "OTHER", note: "x" }),
      ];
      expect(results.filter((x) => x.ok)).toHaveLength(1);
      expect(auditRows(db1).filter((x) => x.action !== "denied")).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
