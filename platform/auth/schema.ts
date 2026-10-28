import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Role names are defined by the consuming app; the platform treats them as opaque strings.
  role: text("role").notNull(),
});

export type User = typeof users.$inferSelect;

export const USERS_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL
);
`;
