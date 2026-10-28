/* Fictional feature flags. Called from scripts/seed.ts (`npm run seed`). */
import type { DbExecutor } from "@/platform/db/client";
import type { auditLog } from "@/platform/audit/schema";
import { featureFlags } from "@/apps/flags/db/schema";
import { FLAGS_APP } from "@/apps/flags/domain/constants";

type SeedFlag = [key: string, description: string, owner: string, staging: boolean, production: boolean, hoursAgo: number, archived?: boolean];

const SEED_FLAGS: SeedFlag[] = [
  ["new_checkout_flow", "Redesigned three-step checkout", "u_alice", true, false, 200],
  ["dark_mode", "Dark theme in the customer dashboard", "u_sara", true, true, 600],
  ["instant_payouts", "Same-day payouts for verified merchants", "u_alice", true, false, 150],
  ["kyc_auto_approve_low_risk", "Auto-approve low-risk KYC cases with clean checks", "u_sara", false, false, 90],
  ["refunds_bulk_actions", "Approve several refunds at once in the refunds app", "u_alice", true, false, 60],
  ["search_v2", "New search backend for transactions", "u_dev", true, true, 900],
  ["mobile_onboarding_v3", "Shorter onboarding in the mobile app", "u_sara", true, true, 400],
  ["fraud_score_v2", "Second-generation fraud scoring model", "u_dev", true, false, 30],
  ["maintenance_banner", "Show a planned-maintenance banner to all users", "u_dev", false, false, 1000],
  ["legacy_reports", "Old CSV reports page", "u_dev", false, false, 2000, true],
];

const HOUR = 3_600_000;
type AuditInsert = typeof auditLog.$inferInsert;

/** Inserts flags and returns their synthetic audit history (the caller inserts it in time order). */
export function seedFlags(tx: DbExecutor, now: number): AuditInsert[] {
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows: AuditInsert[] = [];

  for (const [key, description, owner, staging, production, hoursAgo, archived] of SEED_FLAGS) {
    const created = now - hoursAgo * HOUR;
    let last = created;
    rows.push({ timestamp: iso(created), actorUserId: owner, action: "create", caseId: key, fromStatus: null, toStatus: "off", reason: null, metadata: { description, seeded: true } });
    if (staging || archived) {
      last = created + 2 * HOUR;
      rows.push({ timestamp: iso(last), actorUserId: owner, action: "enable_staging", caseId: key, fromStatus: "off", toStatus: "on", reason: null, metadata: { environment: "staging", seeded: true } });
    }
    if (production || archived) {
      last = created + 48 * HOUR;
      rows.push({ timestamp: iso(last), actorUserId: "u_dev", action: "enable_production", caseId: key, fromStatus: "off", toStatus: "on", reason: "Staging looked good for 2 days", metadata: { environment: "production", seeded: true } });
    }
    if (archived) {
      rows.push({ timestamp: iso(last + 100 * HOUR), actorUserId: "u_dev", action: "disable_production", caseId: key, fromStatus: "on", toStatus: "off", reason: "Replaced by new reports", metadata: { environment: "production", seeded: true } });
      rows.push({ timestamp: iso(last + 101 * HOUR), actorUserId: "u_dev", action: "disable_staging", caseId: key, fromStatus: "on", toStatus: "off", reason: null, metadata: { environment: "staging", seeded: true } });
      last += 102 * HOUR;
      rows.push({ timestamp: iso(last), actorUserId: "u_dev", action: "archive", caseId: key, fromStatus: "active", toStatus: "archived", reason: "No longer used", metadata: { seeded: true } });
    }
    tx.insert(featureFlags).values({
      key, description, ownerUserId: owner, stagingEnabled: staging, productionEnabled: production, archived: archived ?? false,
      createdAt: iso(created), updatedAt: iso(last),
    }).run();
  }

  rows.push({
    timestamp: iso(now - 20 * HOUR), actorUserId: "u_alice", action: "denied", caseId: "instant_payouts", fromStatus: "off", toStatus: null,
    reason: "Only release managers can change production", metadata: { attempted_action: "enable_production", role: "engineer", environment: "production", seeded: true },
  });

  return rows.map((r) => ({ ...r, app: FLAGS_APP }));
}

export const FLAG_COUNT = SEED_FLAGS.length;
