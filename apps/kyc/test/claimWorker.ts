/* Child process used by concurrency.test.ts: waits for a shared start time, then tries to claim. */
import { openDb } from "@/platform/db/client";
import { ALL_DDL } from "@/apps/kyc/db";
import { performCaseAction } from "@/apps/kyc/domain/service";

const [file, userId, role, caseId, startAt] = process.argv.slice(2);
const db = openDb(file, ALL_DDL);
while (Date.now() < Number(startAt)) {
  /* spin so all workers fire at (nearly) the same moment */
}
const r = performCaseAction(db, { id: userId, role }, caseId, { action: "claim" });
process.stdout.write(JSON.stringify(r.ok ? { ok: true } : { ok: false, status: r.error.status, code: r.error.code }));
