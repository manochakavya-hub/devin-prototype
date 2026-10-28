import { openDb, type Db } from "@/platform/db/client";
import { userRoles, users, type AppUser } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { ALL_DDL } from "@/apps/refunds/db";
import { refundRequests, type RefundRequest } from "@/apps/refunds/db/schema";

export const R = {
  agent: { id: "r_agent", email: "agent@example.com", name: "Andy Agent", app: "refunds", role: "agent" },
  agent2: { id: "r_agent2", email: "agent2@example.com", name: "Abby Agent", app: "refunds", role: "agent" },
  approver: { id: "r_fin", email: "fin@example.com", name: "Fran Finance", app: "refunds", role: "finance_approver" },
  approver2: { id: "r_fin2", email: "fin2@example.com", name: "Fred Finance", app: "refunds", role: "finance_approver" },
  auditor: { id: "r_aud", email: "aud@example.com", name: "Ann Auditor", app: "refunds", role: "auditor" },
} satisfies Record<string, AppUser>;

/** Has a KYC role but no refunds role. */
export const KYC_ONLY = { id: "r_kyc", email: "kyc@example.com", name: "Kim Kyc" };

export function createTestDb(file = ":memory:"): Db {
  const db = openDb(file, ALL_DDL);
  db.insert(users).values([...Object.values(R).map(({ id, email, name }) => ({ id, email, name })), KYC_ONLY]).run();
  db.insert(userRoles).values([...Object.values(R).map((u) => ({ userId: u.id, app: u.app, role: u.role })), { userId: KYC_ONLY.id, app: "kyc", role: "reviewer" }]).run();
  return db;
}

let seq = 0;
export function insertRefund(db: Db, overrides: Partial<RefundRequest> = {}): RefundRequest {
  seq += 1;
  const now = new Date().toISOString();
  return db.insert(refundRequests).values({
    id: `RT-${seq}`, customerName: "Test Customer", customerEmail: "customer@example.com", orderId: "ORD-1", paymentRef: "card •••• 0000",
    amountCents: 10_000, category: "damaged_item", customerMessage: "Broken", status: "requested", requestedBy: R.agent2.id,
    decidedBy: null, createdAt: now, updatedAt: now, ...overrides,
  }).returning().get();
}

export function auditRows(db: Db) {
  return db.select().from(auditLog).orderBy(auditLog.id).all();
}
