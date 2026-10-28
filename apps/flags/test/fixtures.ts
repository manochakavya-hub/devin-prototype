import { openDb, type Db } from "@/platform/db/client";
import { userRoles, users, type AppUser } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { ALL_DDL } from "@/apps/flags/db";
import { featureFlags, type FeatureFlag } from "@/apps/flags/db/schema";

export const F = {
  engineer: { id: "f_eng", email: "eng@example.com", name: "Erin Engineer", app: "flags", role: "engineer" },
  release: { id: "f_rel", email: "rel@example.com", name: "Rae Release", app: "flags", role: "release_manager" },
  release2: { id: "f_rel2", email: "rel2@example.com", name: "Rik Release", app: "flags", role: "release_manager" },
  auditor: { id: "f_aud", email: "aud@example.com", name: "Abe Auditor", app: "flags", role: "auditor" },
} satisfies Record<string, AppUser>;

/** Has a refunds role only. */
export const OTHER_APP_ONLY = { id: "f_other", email: "other@example.com", name: "Olli Other" };

export function createTestDb(file = ":memory:"): Db {
  const db = openDb(file, ALL_DDL);
  db.insert(users).values([...Object.values(F).map(({ id, email, name }) => ({ id, email, name })), OTHER_APP_ONLY]).run();
  db.insert(userRoles).values([...Object.values(F).map((u) => ({ userId: u.id, app: u.app, role: u.role })), { userId: OTHER_APP_ONLY.id, app: "refunds", role: "agent" }]).run();
  return db;
}

let seq = 0;
export function insertFlag(db: Db, overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  seq += 1;
  const now = new Date().toISOString();
  return db.insert(featureFlags).values({
    key: `test_flag_${seq}`, description: "Test flag", ownerUserId: F.engineer.id, stagingEnabled: false, productionEnabled: false, archived: false,
    createdAt: now, updatedAt: now, ...overrides,
  }).returning().get();
}

export function auditRows(db: Db) {
  return db.select().from(auditLog).orderBy(auditLog.id).all();
}
