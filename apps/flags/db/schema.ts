import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "@/platform/auth/schema";

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  stagingEnabled: integer("staging_enabled", { mode: "boolean" }).notNull(),
  productionEnabled: integer("production_enabled", { mode: "boolean" }).notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

export const FLAGS_DDL = `
CREATE TABLE IF NOT EXISTS feature_flags (
  key                TEXT PRIMARY KEY,
  description        TEXT NOT NULL,
  owner_user_id      TEXT NOT NULL REFERENCES users(id),
  staging_enabled    INTEGER NOT NULL CHECK (staging_enabled IN (0, 1)),
  production_enabled INTEGER NOT NULL CHECK (production_enabled IN (0, 1)),
  archived           INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (NOT (archived = 1 AND production_enabled = 1))
);
`;
