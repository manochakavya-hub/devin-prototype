import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { CASE_ACTIONS, CASE_STATUSES } from "@/apps/kyc/domain/constants";
import { getCase, performCaseAction } from "@/apps/kyc/domain/service";
import { TERMINAL_STATUSES, nextStatus } from "@/apps/kyc/domain/stateMachine";
import { U, auditRows, createTestDb, insertCase } from "@/apps/kyc/test/fixtures";

describe("nextStatus (pure)", () => {
  it("allows exactly the documented transitions", () => {
    const valid: string[] = [];
    for (const from of CASE_STATUSES) for (const a of CASE_ACTIONS) if (nextStatus(from, a)) valid.push(`${from} -${a}-> ${nextStatus(from, a)}`);
    expect(valid.sort()).toEqual([
      "in_review -approve-> approved",
      "in_review -reject-> rejected",
      "in_review -request_info-> info_requested",
      "info_requested -customer_replied-> pending",
      "pending -claim-> in_review",
    ]);
  });

  it("has no transitions out of terminal states", () => {
    for (const s of TERMINAL_STATUSES) for (const a of CASE_ACTIONS) expect(nextStatus(s, a)).toBeNull();
  });
});

describe("performCaseAction transitions", () => {
  let db: Db;
  beforeEach(() => (db = createTestDb()));

  it("walks a full lifecycle: claim -> request info -> customer replied -> claim -> approve", () => {
    const c = insertCase(db);
    const steps = [
      ["claim", "in_review"],
      ["request_info", "info_requested"],
      ["customer_replied", "pending"],
      ["claim", "in_review"],
      ["approve", "approved"],
    ] as const;
    for (const [action, expected] of steps) {
      const r = performCaseAction(db, U.reviewer, c.id, { action, note: "ok" });
      expect(r.ok, `${action}: ${JSON.stringify(r)}`).toBe(true);
      expect(getCase(db, c.id)!.status).toBe(expected);
    }
    expect(auditRows(db).map((r) => `${r.action}:${r.fromStatus}->${r.toStatus}`)).toEqual([
      "claim:pending->in_review",
      "request_info:in_review->info_requested",
      "customer_replied:info_requested->pending",
      "claim:pending->in_review",
      "approve:in_review->approved",
    ]);
  });

  it("customer_replied unassigns the case so anyone can claim it", () => {
    const c = insertCase(db, { status: "info_requested", assignedTo: U.reviewer.id });
    expect(performCaseAction(db, U.reviewer2, c.id, { action: "customer_replied" }).ok).toBe(true);
    expect(getCase(db, c.id)!.assignedTo).toBeNull();
  });

  it("rejects with reason code + note", () => {
    const c = insertCase(db, { status: "in_review", assignedTo: U.reviewer.id });
    const r = performCaseAction(db, U.reviewer, c.id, { action: "reject", reasonCode: "IDENTITY_MISMATCH", note: "Different person" });
    expect(r.ok).toBe(true);
    const [row] = auditRows(db);
    expect(row).toMatchObject({ action: "reject", reason: "IDENTITY_MISMATCH", toStatus: "rejected" });
    expect(row.metadata).toMatchObject({ reason_code: "IDENTITY_MISMATCH", note: "Different person" });
  });

  it.each([
    ["approve", "pending"],
    ["reject", "pending"],
    ["request_info", "pending"],
    ["customer_replied", "pending"],
    ["claim", "in_review"],
    ["customer_replied", "in_review"],
    ["claim", "approved"],
    ["approve", "approved"],
    ["reject", "approved"],
    ["claim", "rejected"],
    ["approve", "rejected"],
    ["request_info", "info_requested"],
    ["approve", "info_requested"],
  ] as const)("returns 409 for %s on a %s case and logs nothing", (action, status) => {
    const c = insertCase(db, { status, assignedTo: status === "pending" ? null : U.senior.id });
    const r = performCaseAction(db, U.senior, c.id, { action, reasonCode: "OTHER", note: "x" });
    expect(r).toMatchObject({ ok: false, error: { status: 409, code: "invalid_transition" } });
    expect(getCase(db, c.id)!.status).toBe(status);
    expect(auditRows(db)).toHaveLength(0);
  });

  it.each([
    [{ action: "reject", note: "missing code" }, "invalid_reason_code"],
    [{ action: "reject", reasonCode: "NOT_A_CODE", note: "x" }, "invalid_reason_code"],
    [{ action: "reject", reasonCode: "OTHER" }, "note_required"],
    [{ action: "reject", reasonCode: "OTHER", note: "   " }, "note_required"],
    [{ action: "approve", note: 42 }, "invalid_note"],
    [{ action: "approve", note: "x".repeat(2001) }, "invalid_note"],
  ])("returns 400 for invalid payload %j and logs nothing", (input, code) => {
    const c = insertCase(db, { status: "in_review", assignedTo: U.reviewer.id });
    const r = performCaseAction(db, U.reviewer, c.id, input);
    expect(r).toMatchObject({ ok: false, error: { status: 400, code } });
    expect(getCase(db, c.id)!.status).toBe("in_review");
    expect(auditRows(db)).toHaveLength(0);
  });

  it("returns 400 for unknown actions and 404 for unknown cases", () => {
    const c = insertCase(db);
    expect(performCaseAction(db, U.reviewer, c.id, { action: "delete" })).toMatchObject({ ok: false, error: { status: 400 } });
    expect(performCaseAction(db, U.reviewer, "nope", { action: "claim" })).toMatchObject({ ok: false, error: { status: 404 } });
    expect(auditRows(db)).toHaveLength(0);
  });
});
