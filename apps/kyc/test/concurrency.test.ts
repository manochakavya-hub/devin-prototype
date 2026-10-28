import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "@/platform/db/client";
import { ALL_DDL } from "@/apps/kyc/db";
import { applyTransition, getCase, performCaseAction } from "@/apps/kyc/domain/service";
import { U, auditRows, createTestDb, insertCase } from "@/apps/kyc/test/fixtures";

const run = promisify(execFile);
const tmpDirs: string[] = [];
function tempDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-race-"));
  tmpDirs.push(dir);
  return path.join(dir, "race.db");
}
afterEach(() => tmpDirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("concurrent claim: only one succeeds", () => {
  it("conditional update rejects the second claim even when both read the case as pending", () => {
    const db = createTestDb();
    const c = insertCase(db);
    // Both requests read the same (now stale) snapshot before either writes.
    const snapshotA = getCase(db, c.id)!;
    const snapshotB = getCase(db, c.id)!;

    const a = applyTransition(db, U.reviewer, snapshotA, "claim");
    const b = applyTransition(db, U.reviewer2, snapshotB, "claim");

    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, error: { status: 409, code: "conflict" } });
    expect(getCase(db, c.id)!.assignedTo).toBe(U.reviewer.id);
    expect(auditRows(db)).toHaveLength(1);
  });

  it("two connections to the same database file: second claim gets 409", () => {
    const file = tempDbFile();
    const db1 = createTestDb(file);
    const db2 = openDb(file, ALL_DDL);
    const c = insertCase(db1);
    const results = [
      performCaseAction(db1, U.reviewer, c.id, { action: "claim" }),
      performCaseAction(db2, U.senior, c.id, { action: "claim" }),
    ];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(auditRows(db1).filter((r) => r.action === "claim")).toHaveLength(1);
  });

  it("real race across separate OS processes (like multiple server instances)", async () => {
    const file = tempDbFile();
    const db = createTestDb(file);
    const c = insertCase(db);
    const claimers = [U.reviewer, U.reviewer2, U.senior, U.reviewer, U.reviewer2, U.senior];
    const startAt = Date.now() + 2500;
    const worker = path.join(__dirname, "claimWorker.ts");

    const outputs = await Promise.all(
      claimers.map((u) =>
        run(process.execPath, ["--import", "tsx", worker, file, u.id, u.role, c.id, String(startAt)], { cwd: process.cwd() }).then((r) => JSON.parse(r.stdout)),
      ),
    );

    const winners = outputs.filter((o) => o.ok);
    expect(winners).toHaveLength(1);
    for (const o of outputs.filter((x) => !x.ok)) expect(o.status).toBe(409);
    expect(auditRows(db).filter((r) => r.action === "claim")).toHaveLength(1);
    expect(getCase(db, c.id)!.status).toBe("in_review");
  }, 30_000);
});
