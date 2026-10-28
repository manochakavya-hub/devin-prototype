import { openDb, type Db } from "@/platform/db/client";
import { users, type User } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { ALL_DDL } from "@/apps/kyc/db";
import { kycCases, type KycCase } from "@/apps/kyc/db/schema";

export const U = {
  reviewer: { id: "u_rev", email: "rev@example.com", name: "Rita Reviewer", role: "reviewer" },
  reviewer2: { id: "u_rev2", email: "rev2@example.com", name: "Rob Reviewer", role: "reviewer" },
  senior: { id: "u_sen", email: "sen@example.com", name: "Sam Senior", role: "senior_reviewer" },
  auditor: { id: "u_aud", email: "aud@example.com", name: "Ada Auditor", role: "auditor" },
} satisfies Record<string, User>;

export function createTestDb(file = ":memory:"): Db {
  const db = openDb(file, ALL_DDL);
  db.insert(users).values(Object.values(U)).run();
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
