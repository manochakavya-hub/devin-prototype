import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { createFlag, flagCapabilities, getFlag, performFlagAction, toggleFlag } from "@/apps/flags/domain/service";
import { F, auditRows, createTestDb, insertFlag } from "@/apps/flags/test/fixtures";

let db: Db;
beforeEach(() => (db = createTestDb()));

describe("creating flags", () => {
  it("engineer creates a flag, off everywhere, with one audit row", () => {
    const r = createFlag(db, F.engineer, { key: "new_widget", description: "Shiny widget" });
    expect(r).toMatchObject({ ok: true, flag: { key: "new_widget", ownerUserId: F.engineer.id, stagingEnabled: false, productionEnabled: false } });
    expect(auditRows(db).map((a) => [a.app, a.action, a.caseId, a.toStatus])).toEqual([["flags", "create", "new_widget", "off"]]);
  });

  it("validates key and description (400) and rejects duplicates (409), logging nothing", () => {
    expect(createFlag(db, F.engineer, { key: "Bad Key", description: "x" })).toMatchObject({ ok: false, error: { status: 400, code: "invalid_key" } });
    expect(createFlag(db, F.engineer, { key: "audit", description: "x" })).toMatchObject({ ok: false, error: { status: 400, code: "invalid_key" } });
    expect(createFlag(db, F.engineer, { key: "ok_key", description: "  " })).toMatchObject({ ok: false, error: { status: 400, code: "description_required" } });
    insertFlag(db, { key: "taken" });
    expect(createFlag(db, F.engineer, { key: "taken", description: "x" })).toMatchObject({ ok: false, error: { status: 409, code: "duplicate_key" } });
    expect(auditRows(db)).toHaveLength(0);
  });

  it("auditor can't create (403, logged)", () => {
    expect(createFlag(db, F.auditor, { key: "nope_flag", description: "x" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(auditRows(db)[0]).toMatchObject({ action: "denied", metadata: { attempted_action: "create" } });
    expect(getFlag(db, "nope_flag")).toBeUndefined();
  });
});

describe("toggling flags", () => {
  it("engineer can toggle staging but not production (403, logged)", () => {
    const f = insertFlag(db);
    expect(performFlagAction(db, F.engineer, f.key, { action: "enable", environment: "staging" }).ok).toBe(true);
    expect(performFlagAction(db, F.engineer, f.key, { action: "enable", environment: "production", reason: "go" })).toMatchObject({ ok: false, error: { status: 403, message: "Only release managers can change production" } });
    expect(getFlag(db, f.key)).toMatchObject({ stagingEnabled: true, productionEnabled: false });
    expect(auditRows(db).map((a) => [a.action, a.fromStatus, a.toStatus])).toEqual([
      ["enable_staging", "off", "on"],
      ["denied", "off", null],
    ]);
    expect(auditRows(db)[1]).toMatchObject({ metadata: { attempted_action: "enable_production", environment: "production", role: "engineer" } });
  });

  it("release manager changes production, which requires a reason (400, nothing logged)", () => {
    const f = insertFlag(db);
    expect(performFlagAction(db, F.release, f.key, { action: "enable", environment: "production" })).toMatchObject({ ok: false, error: { status: 400, code: "reason_required" } });
    expect(auditRows(db)).toHaveLength(0);
    expect(performFlagAction(db, F.release, f.key, { action: "enable", environment: "production", reason: "Launch day" }).ok).toBe(true);
    expect(auditRows(db)[0]).toMatchObject({ action: "enable_production", reason: "Launch day", metadata: { environment: "production" } });
  });

  it("no-op and archived changes get 409 and log nothing", () => {
    const f = insertFlag(db, { stagingEnabled: true });
    expect(performFlagAction(db, F.engineer, f.key, { action: "enable", environment: "staging" })).toMatchObject({ ok: false, error: { status: 409, code: "no_change" } });
    const a = insertFlag(db, { archived: true });
    expect(performFlagAction(db, F.engineer, a.key, { action: "enable", environment: "staging" })).toMatchObject({ ok: false, error: { status: 409, code: "archived" } });
    expect(auditRows(db)).toHaveLength(0);
  });

  it("unknown action / environment / flag: 400 / 400 / 404", () => {
    const f = insertFlag(db);
    expect(performFlagAction(db, F.release, f.key, { action: "delete" })).toMatchObject({ ok: false, error: { status: 400 } });
    expect(performFlagAction(db, F.release, f.key, { action: "enable", environment: "dev" })).toMatchObject({ ok: false, error: { status: 400 } });
    expect(performFlagAction(db, F.release, "missing", { action: "archive" })).toMatchObject({ ok: false, error: { status: 404 } });
  });

  it("auditor is read-only", () => {
    const f = insertFlag(db);
    expect(performFlagAction(db, F.auditor, f.key, { action: "enable", environment: "staging" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(flagCapabilities(F.auditor, f)).toEqual({ staging: false, production: false, archive: false });
  });
});

describe("archiving", () => {
  it("only release managers, only when off in production; staging is switched off too", () => {
    const live = insertFlag(db, { stagingEnabled: true, productionEnabled: true });
    expect(performFlagAction(db, F.engineer, live.key, { action: "archive" })).toMatchObject({ ok: false, error: { status: 403 } });
    expect(performFlagAction(db, F.release, live.key, { action: "archive" })).toMatchObject({ ok: false, error: { status: 409, code: "production_on" } });
    const f = insertFlag(db, { stagingEnabled: true });
    expect(performFlagAction(db, F.release, f.key, { action: "archive", reason: "Done" }).ok).toBe(true);
    expect(getFlag(db, f.key)).toMatchObject({ archived: true, stagingEnabled: false });
    expect(flagCapabilities(F.release, getFlag(db, f.key)!)).toEqual({ staging: false, production: false, archive: false });
  });
});

describe("atomicity and concurrency", () => {
  it("rolls back the toggle when the audit insert fails", () => {
    const f = insertFlag(db);
    db.run(sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);
    expect(() => performFlagAction(db, F.engineer, f.key, { action: "enable", environment: "staging" })).toThrow();
    expect(getFlag(db, f.key)!.stagingEnabled).toBe(false);
  });

  it("rolls back flag creation when the audit insert fails", () => {
    db.run(sql`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);
    expect(() => createFlag(db, F.engineer, { key: "ghost_flag", description: "x" })).toThrow();
    expect(getFlag(db, "ghost_flag")).toBeUndefined();
  });

  it("two people toggling from the same stale view: only one change applies", () => {
    const f = insertFlag(db);
    const viewA = getFlag(db, f.key)!;
    const viewB = getFlag(db, f.key)!;
    expect(toggleFlag(db, F.release, viewA, "enable", "production", "Launch").ok).toBe(true);
    expect(toggleFlag(db, F.release2, viewB, "enable", "production", "Also launch")).toMatchObject({ ok: false, error: { status: 409, code: "conflict" } });
    expect(auditRows(db).filter((r) => r.action === "enable_production")).toHaveLength(1);
  });
});
