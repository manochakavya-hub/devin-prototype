import { defaultDbPath, openDb, type Db } from "@/platform/db/client";
import { USERS_DDL } from "@/platform/auth/schema";
import { AUDIT_DDL } from "@/platform/audit/schema";
import { FLAGS_DDL } from "@/apps/flags/db/schema";

export const ALL_DDL = [USERS_DDL, AUDIT_DDL, FLAGS_DDL];

const store = globalThis as unknown as { __flagsDb?: Db };

export function getDb(): Db {
  if (!store.__flagsDb) store.__flagsDb = openDb(defaultDbPath(), ALL_DDL);
  return store.__flagsDb;
}

export function setDbForTesting(db: Db | undefined): void {
  store.__flagsDb = db;
}
