/* Resets the local database and fills it with fictional data. Run with `npm run seed`. */
import fs from "node:fs";
import { users } from "@/platform/auth/schema";
import { auditLog } from "@/platform/audit/schema";
import { openDb } from "@/platform/db/client";
import { ALL_DDL, dbPath } from "@/apps/kyc/db";
import { kycCases, type KycCase } from "@/apps/kyc/db/schema";
import type { RejectionReason } from "@/apps/kyc/domain/constants";

const SEED_USERS = [
  { id: "u_alice", email: "alice.moreno@example.com", name: "Alice Moreno", role: "reviewer" },
  { id: "u_ben", email: "ben.okafor@example.com", name: "Ben Okafor", role: "reviewer" },
  { id: "u_sara", email: "sara.lindqvist@example.com", name: "Sara Lindqvist", role: "senior_reviewer" },
  { id: "u_dev", email: "dev.patel@example.com", name: "Dev Patel", role: "senior_reviewer" },
  { id: "u_grace", email: "grace.kim@example.com", name: "Grace Kim", role: "auditor" },
];

type SeedCase = [
  applicant: string,
  country: string,
  risk: KycCase["riskLevel"],
  flagReason: string,
  status: KycCase["status"],
  hoursAgo: number,
  nameOnId: string | null, // null = same as applicant (name on form)
  idDoc: KycCase["idDocumentStatus"],
  selfie: number,
  sanctions: KycCase["sanctionsCheckResult"],
  assignee?: string,
  rejection?: RejectionReason,
];

// All names are fictional.
const SEED_CASES: SeedCase[] = [
  ["Jonathan Mercer", "United Kingdom", "low", "Name mismatch between form and ID", "pending", 2, "Jon Mercer", "verified", 94, "clear"],
  ["Amara Nwosu", "Nigeria", "medium", "Low selfie match score", "pending", 5, null, "verified", 71, "clear"],
  ["Lukas Brandt", "Germany", "low", "Address verification failed", "pending", 9, null, "verified", 97, "clear"],
  ["Mei-Ling Chou", "Singapore", "high", "Potential sanctions list match", "pending", 30, "Chou Mei Ling", "verified", 92, "potential_match"],
  ["Rafael Duarte", "Brazil", "medium", "ID document expired", "pending", 52, null, "expired", 88, "clear"],
  ["Fatima Al-Sayed", "United Arab Emirates", "high", "PEP screening hit", "pending", 75, "Fatima Alsayed", "verified", 95, "pep_match"],
  ["Oliver Grant", "Canada", "low", "Unusual onboarding velocity", "pending", 1, null, "verified", 99, "clear"],
  ["Ines Carvalho", "Portugal", "medium", "Name mismatch between form and ID", "pending", 18, "Inês Carvalho Pereira", "verified", 90, "clear"],
  ["Tomasz Wisniewski", "Poland", "low", "ID document unreadable", "pending", 26, null, "unreadable", 83, "clear"],
  ["Priya Raman", "India", "high", "High-risk jurisdiction for source of funds", "pending", 100, null, "verified", 91, "clear"],
  ["Hannah Schultz", "Austria", "medium", "Low selfie match score", "in_review", 40, null, "verified", 64, "clear", "u_alice"],
  ["Kwame Mensah", "Ghana", "low", "Address verification failed", "in_review", 20, null, "verified", 96, "clear", "u_ben"],
  ["Elena Petrova", "Bulgaria", "high", "Potential sanctions list match", "in_review", 60, "Elena Petrova-Ivanova", "verified", 89, "potential_match", "u_sara"],
  ["Diego Fernandez", "Mexico", "medium", "ID document expired", "in_review", 33, "Diego Fernández", "expired", 87, "clear", "u_alice"],
  ["Yuki Tanaka", "Japan", "low", "Name mismatch between form and ID", "in_review", 12, "Tanaka Yuki", "verified", 98, "clear", "u_ben"],
  ["Samuel Achebe", "Kenya", "medium", "ID document unreadable", "info_requested", 80, null, "unreadable", 79, "clear", "u_alice"],
  ["Chloe Martin", "France", "high", "PEP screening hit", "info_requested", 120, null, "verified", 93, "pep_match", "u_dev"],
  ["Noah Williams", "United States", "low", "Unusual onboarding velocity", "info_requested", 45, null, "verified", 95, "clear", "u_ben"],
  ["Sofia Rossi", "Italy", "low", "Address verification failed", "approved", 150, null, "verified", 97, "clear", "u_alice"],
  ["Ahmed Hassan", "Egypt", "medium", "Low selfie match score", "approved", 170, null, "verified", 82, "clear", "u_ben"],
  ["Anna Kowalczyk", "Poland", "high", "Potential sanctions list match", "approved", 200, null, "verified", 94, "potential_match", "u_sara"],
  ["Liam O'Connor", "Ireland", "low", "Name mismatch between form and ID", "approved", 130, "Liam OConnor", "verified", 96, "clear", "u_alice"],
  ["Viktor Sokolov", "Estonia", "high", "Potential sanctions list match", "rejected", 190, null, "verified", 90, "potential_match", "u_dev", "SANCTIONS_HIT"],
  ["Grace Liu", "Australia", "medium", "ID document suspected tampering", "rejected", 160, null, "suspected_tampering", 58, "clear", "u_ben", "DOCUMENT_TAMPERED"],
  ["Marco Bianchi", "Switzerland", "low", "Name mismatch between form and ID", "rejected", 140, "Marcus Bianco", "verified", 41, "clear", "u_alice", "IDENTITY_MISMATCH"],
];

const HOUR = 3_600_000;

function main() {
  const file = dbPath();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  const db = openDb(file, ALL_DDL);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  db.transaction((tx) => {
    tx.insert(users).values(SEED_USERS).run();

    SEED_CASES.forEach((c, i) => {
      const [applicant, country, risk, flagReason, status, hoursAgo, nameOnId, idDoc, selfie, sanctions, assignee, rejection] = c;
      const id = `KYC-${1001 + i}`;
      const created = now - hoursAgo * HOUR;
      const claimedAt = created + 1 * HOUR;
      const decidedAt = created + 3 * HOUR;
      const events: (typeof auditLog.$inferInsert)[] = [];
      const meta = { risk_level: risk, seeded: true };

      if (status !== "pending" && assignee) {
        events.push({ timestamp: iso(claimedAt), actorUserId: assignee, action: "claim", caseId: id, fromStatus: "pending", toStatus: "in_review", reason: null, metadata: meta });
      }
      if (status === "approved") {
        events.push({ timestamp: iso(decidedAt), actorUserId: assignee!, action: "approve", caseId: id, fromStatus: "in_review", toStatus: "approved", reason: "Checks reviewed, no concerns", metadata: { ...meta, note: "Checks reviewed, no concerns" } });
      }
      if (status === "rejected") {
        events.push({ timestamp: iso(decidedAt), actorUserId: assignee!, action: "reject", caseId: id, fromStatus: "in_review", toStatus: "rejected", reason: rejection!, metadata: { ...meta, reason_code: rejection, note: "See check results" } });
      }
      if (status === "info_requested") {
        events.push({ timestamp: iso(decidedAt), actorUserId: assignee!, action: "request_info", caseId: id, fromStatus: "in_review", toStatus: "info_requested", reason: "Please provide a clearer photo of your ID", metadata: { ...meta, note: "Please provide a clearer photo of your ID" } });
      }

      tx.insert(kycCases).values({
        id, applicantName: applicant, country, riskLevel: risk, flagReason, status,
        assignedTo: status === "pending" ? null : (assignee ?? null),
        createdAt: iso(created),
        updatedAt: events.length ? events[events.length - 1].timestamp : iso(created),
        nameOnForm: applicant, nameOnId: nameOnId ?? applicant,
        idDocumentStatus: idDoc, selfieMatchPct: selfie, sanctionsCheckResult: sanctions,
      }).run();
      if (events.length) tx.insert(auditLog).values(events).run();
    });

    // One historic denied attempt so the audit viewer shows what a denial looks like.
    tx.insert(auditLog).values({
      timestamp: iso(now - 50 * HOUR), actorUserId: "u_alice", action: "denied", caseId: "KYC-1013",
      fromStatus: "in_review", toStatus: null, reason: "High-risk cases can only be decided by a senior reviewer",
      metadata: { attempted_action: "approve", risk_level: "high", seeded: true },
    }).run();
  });

  console.log(`Seeded ${SEED_USERS.length} users and ${SEED_CASES.length} cases into ${file}`);
}

main();
