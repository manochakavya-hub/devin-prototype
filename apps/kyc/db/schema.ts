import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  CASE_STATUSES,
  ID_DOCUMENT_STATUSES,
  RISK_LEVELS,
  SANCTIONS_RESULTS,
} from "@/apps/kyc/domain/constants";

export const kycCases = sqliteTable("kyc_cases", {
  id: text("id").primaryKey(),
  applicantName: text("applicant_name").notNull(),
  country: text("country").notNull(),
  riskLevel: text("risk_level", { enum: RISK_LEVELS }).notNull(),
  flagReason: text("flag_reason").notNull(),
  status: text("status", { enum: CASE_STATUSES }).notNull(),
  assignedTo: text("assigned_to"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  nameOnForm: text("name_on_form").notNull(),
  nameOnId: text("name_on_id").notNull(),
  idDocumentStatus: text("id_document_status", { enum: ID_DOCUMENT_STATUSES }).notNull(),
  selfieMatchPct: integer("selfie_match_pct").notNull(),
  sanctionsCheckResult: text("sanctions_check_result", { enum: SANCTIONS_RESULTS }).notNull(),
});

export type KycCase = typeof kycCases.$inferSelect;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

export const KYC_DDL = `
CREATE TABLE IF NOT EXISTS kyc_cases (
  id                     TEXT PRIMARY KEY,
  applicant_name         TEXT NOT NULL,
  country                TEXT NOT NULL,
  risk_level             TEXT NOT NULL CHECK (risk_level IN (${list(RISK_LEVELS)})),
  flag_reason            TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN (${list(CASE_STATUSES)})),
  assigned_to            TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  name_on_form           TEXT NOT NULL,
  name_on_id             TEXT NOT NULL,
  id_document_status     TEXT NOT NULL CHECK (id_document_status IN (${list(ID_DOCUMENT_STATUSES)})),
  selfie_match_pct       INTEGER NOT NULL CHECK (selfie_match_pct BETWEEN 0 AND 100),
  sanctions_check_result TEXT NOT NULL CHECK (sanctions_check_result IN (${list(SANCTIONS_RESULTS)}))
);
CREATE INDEX IF NOT EXISTS kyc_cases_status_idx ON kyc_cases(status, created_at);
`;
