import path from "node:path";
import { openDb, type Db } from "@/platform/db/client";
import { USERS_DDL } from "@/platform/auth/schema";
import { AUDIT_DDL } from "@/platform/audit/schema";
import { KYC_DDL } from "@/apps/kyc/db/schema";

export const ALL_DDL = [USERS_DDL, AUDIT_DDL, KYC_DDL];

export function dbPath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "kyc.db");
}

// Cached on globalThis so Next.js dev hot-reloads don't open a new connection each time.
const store = globalThis as unknown as { __kycDb?: Db };

export function getDb(): Db {
  if (!store.__kycDb) store.__kycDb = openDb(dbPath(), ALL_DDL);
  return store.__kycDb;
}

export function setDbForTesting(db: Db | undefined): void {
  store.__kycDb = db;
}
