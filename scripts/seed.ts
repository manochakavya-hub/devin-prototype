/* Resets the local database and fills it with fictional data. Run with `npm run seed` (stop the dev server first). */
import fs from "node:fs";
import { defaultDbPath, openDb } from "@/platform/db/client";
import { userRoles, users } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { ALL_DDL as KYC_DDL } from "@/apps/kyc/db";
import { KYC_CASE_COUNT, seedKyc } from "@/apps/kyc/db/seed";
import { ALL_DDL as REFUNDS_DDL } from "@/apps/refunds/db";
import { REFUND_COUNT, seedRefunds } from "@/apps/refunds/db/seed";
import { ALL_DDL as FLAGS_DDL } from "@/apps/flags/db";
import { FLAG_COUNT, seedFlags } from "@/apps/flags/db/seed";

const SEED_USERS = [
  { id: "u_alice", email: "alice.moreno@example.com", name: "Alice Moreno" },
  { id: "u_ben", email: "ben.okafor@example.com", name: "Ben Okafor" },
  { id: "u_sara", email: "sara.lindqvist@example.com", name: "Sara Lindqvist" },
  { id: "u_dev", email: "dev.patel@example.com", name: "Dev Patel" },
  { id: "u_grace", email: "grace.kim@example.com", name: "Grace Kim" },
  { id: "u_omar", email: "omar.haddad@example.com", name: "Omar Haddad" },
];

// One role per user per app. No row = no access to that app.
const SEED_ROLES: [userId: string, app: string, role: string][] = [
  ["u_alice", "kyc", "reviewer"],
  ["u_alice", "refunds", "agent"],
  ["u_ben", "kyc", "reviewer"],
  ["u_ben", "refunds", "finance_approver"],
  ["u_sara", "kyc", "senior_reviewer"],
  ["u_dev", "kyc", "senior_reviewer"],
  ["u_dev", "refunds", "agent"],
  ["u_grace", "kyc", "auditor"],
  ["u_grace", "refunds", "auditor"],
  ["u_omar", "refunds", "finance_approver"],
  ["u_alice", "flags", "engineer"],
  ["u_sara", "flags", "engineer"],
  ["u_dev", "flags", "release_manager"],
  ["u_grace", "flags", "auditor"],
];

function main() {
  const file = defaultDbPath();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  const db = openDb(file, [...new Set([...KYC_DDL, ...REFUNDS_DDL, ...FLAGS_DDL])]);
  const now = Date.now();

  db.transaction((tx) => {
    tx.insert(users).values(SEED_USERS).run();
    tx.insert(userRoles).values(SEED_ROLES.map(([userId, app, role]) => ({ userId, app, role }))).run();
    const auditRows = [...seedKyc(tx, now), ...seedRefunds(tx, now), ...seedFlags(tx, now)];
    // Inserted in timestamp order so audit ids increase with time, like a real log.
    auditRows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    tx.insert(auditLog).values(auditRows).run();
  });

  console.log(`Seeded ${SEED_USERS.length} users, ${KYC_CASE_COUNT} KYC cases, ${REFUND_COUNT} refund requests, ${FLAG_COUNT} feature flags into ${file}`);
}

main();
