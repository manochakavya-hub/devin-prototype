import { defaultDbPath, openDb, type Db } from "@/platform/db/client";
import { USERS_DDL } from "@/platform/auth/schema";
import { AUDIT_DDL } from "@/platform/audit/schema";
import { REFUNDS_DDL } from "@/apps/refunds/db/schema";

export const ALL_DDL = [USERS_DDL, AUDIT_DDL, REFUNDS_DDL];

const store = globalThis as unknown as { __refundsDb?: Db };

export function getDb(): Db {
  if (!store.__refundsDb) store.__refundsDb = openDb(defaultDbPath(), ALL_DDL);
  return store.__refundsDb;
}

export function setDbForTesting(db: Db | undefined): void {
  store.__refundsDb = db;
}
