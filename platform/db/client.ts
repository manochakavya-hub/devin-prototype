import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type Db = BetterSQLite3Database;

/**
 * Opens a SQLite database and applies the given idempotent DDL statements
 * (each module that owns tables exports its own DDL string).
 */
export function openDb(file: string, ddl: string[]): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  if (file !== ":memory:") sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  for (const statement of ddl) sqlite.exec(statement);
  return drizzle(sqlite);
}

export function nowIso(): string {
  return new Date().toISOString();
}
