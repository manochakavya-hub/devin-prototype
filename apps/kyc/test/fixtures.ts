import { openDb, type Db } from "@/platform/db/client";
import { userRoles, users, type AppUser } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { ALL_DDL } from "@/apps/kyc/db";
import { kycCases, type KycCase } from "@/apps/kyc/db/schema";

export const U = {
  reviewer: { id: "u_rev", email: "rev@example.com", name: "Rita Reviewer", app: "kyc", role: "reviewer" },
  reviewer2: { id: "u_rev2", email: "rev2@example.com", name: "Rob Reviewer", app: "kyc", role: "reviewer" },
  senior: { id: "u_sen", email: "sen@example.com", name: "Sam Senior", app: "kyc", role: "senior_reviewer" },
  auditor: { id: "u_aud", email: "aud@example.com", name: "Ada Auditor", app: "kyc", role: "auditor" },
} satisfies Record<string, AppUser>;

/** Has a role in another app only. */
export const OUTSIDER = { id: "u_out", email: "out@example.com", name: "Otto Outsider" };

export function createTestDb(file = ":memory:"): Db {
  const db = openDb(file, ALL_DDL);
  db.insert(users).values([...Object.values(U).map(({ id, email, name }) => ({ id, email, name })), OUTSIDER]).run();
  db.insert(userRoles).values([...Object.values(U).map((u) => ({ userId: u.id, app: u.app, role: u.role })), { userId: OUTSIDER.id, app: "other", role: "admin" }]).run();
  return db;
}

let seq = 0;
export function insertCase(db: Db, overrides: Partial<KycCase> = {}): KycCase {
  seq += 1;
  const now = new Date().toISOString();
  return db
    .insert(kycCases)
    .values({
      id: `T-${seq}`,
      applicantName: "Test Applicant",
      country: "Testland",
      riskLevel: "low",
      flagReason: "Test flag",
      status: "pending",
      assignedTo: null,
      createdAt: now,
      updatedAt: now,
      nameOnForm: "Test Applicant",
      nameOnId: "Test Applicant",
      idDocumentStatus: "verified",
      selfieMatchPct: 95,
      sanctionsCheckResult: "clear",
      ...overrides,
    })
    .returning()
    .get();
}

export function auditRows(db: Db) {
  return db.select().from(auditLog).orderBy(auditLog.id).all();
}
