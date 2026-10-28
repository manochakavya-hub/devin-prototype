/* Fictional refund requests. Called from scripts/seed.ts (`npm run seed`). */
import type { DbExecutor } from "@/platform/db/client";
import type { auditLog } from "@/platform/audit/schema";
import { refundRequests, type RefundRequest } from "@/apps/refunds/db/schema";
import { REFUNDS_APP, type RefundCategory, type RefundRejectionReason } from "@/apps/refunds/domain/constants";

type SeedRefund = [
  customer: string,
  amountCents: number,
  category: RefundCategory,
  message: string,
  status: RefundRequest["status"],
  hoursAgo: number,
  requestedBy: string,
  decidedBy?: string,
  rejection?: RefundRejectionReason,
  paidBy?: string,
];

const SEED_REFUNDS: SeedRefund[] = [
  ["Maya Thornton", 4_999, "damaged_item", "The mug arrived in pieces, photos attached to the ticket.", "requested", 70, "u_alice"],
  ["Lucas Ferreira", 12_900, "not_delivered", "Tracking says delivered but nothing arrived.", "requested", 52, "u_dev"],
  ["Priyanka Iyer", 124_000, "duplicate_charge", "I was charged twice for my annual business plan.", "requested", 44, "u_alice"],
  ["Tomasz Nowak", 89_900, "wrong_item", "Received a different laptop model than the one ordered.", "requested", 30, "u_ben"],
  ["Aisha Bello", 2_599, "cancelled_subscription", "Cancelled in March, still billed in April.", "requested", 20, "u_dev"],
  ["Henrik Larsen", 50_000, "damaged_item", "Monitor screen cracked on arrival.", "requested", 12, "u_dev"],
  ["Sofia Marquez", 7_450, "not_delivered", "Package lost in transit according to the courier.", "requested", 5, "u_alice"],
  ["Daniel Kim", 3_200, "wrong_item", "Got size M instead of L.", "approved", 96, "u_alice", "u_dev"],
  ["Fatou Diallo", 64_000, "duplicate_charge", "Two identical charges on the same day.", "approved", 80, "u_dev", "u_omar"],
  ["Ethan Brooks", 15_999, "damaged_item", "Headphones stopped working after one day.", "approved", 60, "u_dev", "u_alice"],
  ["Olga Petrenko", 21_000, "damaged_item", "Chair arrived with a broken leg.", "rejected", 120, "u_alice", "u_dev", "ITEM_NOT_RETURNED"],
  ["Marcus Webb", 250_000, "not_delivered", "Never received any of the five phones.", "rejected", 110, "u_dev", "u_ben", "SUSPECTED_FRAUD"],
  ["Chen Wei", 1_899, "cancelled_subscription", "Charged after cancelling last year.", "rejected", 100, "u_alice", "u_dev", "OUTSIDE_REFUND_WINDOW"],
  ["Nadia Rahman", 4_500, "wrong_item", "Wrong colour sent.", "paid", 150, "u_dev", "u_alice", undefined, "u_ben"],
  ["Jorge Alvarez", 78_000, "duplicate_charge", "Charged twice for the same order.", "paid", 140, "u_alice", "u_omar", undefined, "u_ben"],
  ["Emily Carter", 9_900, "not_delivered", "Order cancelled by the warehouse but I was still charged.", "paid", 130, "u_alice", "u_dev", undefined, "u_omar"],
];

const HOUR = 3_600_000;
type AuditInsert = typeof auditLog.$inferInsert;

/** Inserts refund requests and returns their synthetic audit history (the caller inserts it in time order). */
export function seedRefunds(tx: DbExecutor, now: number): AuditInsert[] {
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows: AuditInsert[] = [];

  SEED_REFUNDS.forEach(([customer, amountCents, category, message, status, hoursAgo, requestedBy, decidedBy, rejection, paidBy], i) => {
    const id = `RF-${2001 + i}`;
    const created = now - hoursAgo * HOUR;
    const decidedAt = created + 2 * HOUR;
    const paidAt = created + 6 * HOUR;
    const meta = { amount_cents: amountCents, seeded: true };

    rows.push({ timestamp: iso(created), actorUserId: requestedBy, action: "submit", caseId: id, fromStatus: null, toStatus: "requested", reason: null, metadata: meta });
    if (status === "approved" || status === "paid") {
      rows.push({ timestamp: iso(decidedAt), actorUserId: decidedBy!, action: "approve", caseId: id, fromStatus: "requested", toStatus: "approved", reason: null, metadata: meta });
    }
    if (status === "rejected") {
      rows.push({ timestamp: iso(decidedAt), actorUserId: decidedBy!, action: "reject", caseId: id, fromStatus: "requested", toStatus: "rejected", reason: rejection!, metadata: { ...meta, reason_code: rejection, note: "See ticket history" } });
    }
    if (status === "paid") {
      rows.push({ timestamp: iso(paidAt), actorUserId: paidBy!, action: "mark_paid", caseId: id, fromStatus: "approved", toStatus: "paid", reason: null, metadata: meta });
    }

    const [first, last] = customer.toLowerCase().split(" ");
    tx.insert(refundRequests).values({
      id, customerName: customer, customerEmail: `${first}.${last}@example.com`,
      orderId: `ORD-${50_311 + i * 37}`, paymentRef: `card •••• ${String(4_000 + i * 113).slice(-4)}`,
      amountCents, category, customerMessage: message, status, requestedBy,
      decidedBy: decidedBy ?? null, createdAt: iso(created),
      updatedAt: status === "paid" ? iso(paidAt) : decidedBy ? iso(decidedAt) : iso(created),
    }).run();
  });

  // One historic denial: an agent trying to approve a refund above their limit.
  rows.push({
    timestamp: iso(now - 40 * HOUR), actorUserId: "u_dev", action: "denied", caseId: "RF-2003", fromStatus: "requested", toStatus: null,
    reason: "Refunds over $500.00 need a finance approver", metadata: { attempted_action: "approve", role: "agent", amount_cents: 124_000, seeded: true },
  });

  return rows.map((r) => ({ ...r, app: REFUNDS_APP }));
}

export const REFUND_COUNT = SEED_REFUNDS.length;
