import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "@/platform/auth/schema";
import type { RefundCategory, RefundStatus } from "@/apps/refunds/domain/constants";

export const refundRequests = sqliteTable("refund_requests", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  orderId: text("order_id").notNull(),
  paymentRef: text("payment_ref").notNull(),
  amountCents: integer("amount_cents").notNull(),
  category: text("category").$type<RefundCategory>().notNull(),
  customerMessage: text("customer_message").notNull(),
  status: text("status").$type<RefundStatus>().notNull(),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  decidedBy: text("decided_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type RefundRequest = typeof refundRequests.$inferSelect;

export const REFUNDS_DDL = `
CREATE TABLE IF NOT EXISTS refund_requests (
  id               TEXT PRIMARY KEY,
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  order_id         TEXT NOT NULL,
  payment_ref      TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  category         TEXT NOT NULL,
  customer_message TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'paid')),
  requested_by     TEXT NOT NULL REFERENCES users(id),
  decided_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON refund_requests(status, created_at);
`;
