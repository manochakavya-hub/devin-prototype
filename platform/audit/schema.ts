import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  // Generic subject id. Named case_id per the KYC spec; other apps store their own entity id here.
  caseId: text("case_id"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  reason: text("reason"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
});

export type AuditRow = typeof auditLog.$inferSelect;

export const AUDIT_DDL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,
  case_id       TEXT,
  from_status   TEXT,
  to_status     TEXT,
  reason        TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata))
);
CREATE INDEX IF NOT EXISTS audit_log_case_idx ON audit_log(case_id, id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_user_id, id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action, id);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not allowed');
END;

-- INSERT OR REPLACE on an existing id would otherwise silently delete + reinsert the row.
CREATE TRIGGER IF NOT EXISTS audit_log_no_overwrite
BEFORE INSERT ON audit_log
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: overwriting an existing row is not allowed');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not allowed');
END;
`;
