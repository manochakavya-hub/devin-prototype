import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});

export type User = typeof users.$inferSelect;

/**
 * One role per user per app. App ids and role names are defined by the consuming app; the platform
 * treats them as opaque strings. No row for an app = no access to that app.
 */
export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id").notNull().references(() => users.id),
    app: text("app").notNull(),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.app] })],
);

export type UserRole = typeof userRoles.$inferSelect;

/** A user as seen by one app: identity plus their role in that app. */
export type AppUser = User & { app: string; role: string };

export const USERS_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  app     TEXT NOT NULL,
  role    TEXT NOT NULL,
  PRIMARY KEY (user_id, app)
);
`;
