import { defaultDbPath, openDb, type Db } from "@/platform/db/client";
import { USERS_DDL } from "@/platform/auth/schema";
import { AUDIT_DDL } from "@/platform/audit/schema";

const store = globalThis as unknown as { __homeDb?: Db };

/** Connection for app-independent pages (login, launcher). Same file as every app. */
export function getHomeDb(): Db {
  if (!store.__homeDb) store.__homeDb = openDb(defaultDbPath(), [USERS_DDL, AUDIT_DDL]);
  return store.__homeDb;
}
