import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { SESSION_COOKIE, createSessionToken } from "@/platform/auth/session";
import { setDbForTesting } from "@/apps/kyc/db";
import { auditHandler, caseActionHandler, getCaseHandler, listCasesHandler } from "@/apps/kyc/api/handlers";
import { getCase } from "@/apps/kyc/domain/service";
import { U, auditRows, createTestDb, insertCase } from "@/apps/kyc/test/fixtures";

let db: Db;
beforeEach(() => {
  db = createTestDb();
  setDbForTesting(db);
});
afterEach(() => setDbForTesting(undefined));

function req(url: string, opts: { userId?: string; cookie?: string; body?: unknown; contentType?: string } = {}) {
  const headers: Record<string, string> = {};
  const cookie = opts.cookie ?? (opts.userId ? `${SESSION_COOKIE}=${createSessionToken(opts.userId)}` : undefined);
  if (cookie) headers.cookie = cookie;
  if (opts.body !== undefined) headers["content-type"] = opts.contentType ?? "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API routes enforce auth server-side", () => {
  it("401 without a session, and with a forged cookie", async () => {
    const c = insertCase(db);
    expect((await listCasesHandler(req("/api/kyc/cases"))).status).toBe(401);
    const forged = `${SESSION_COOKIE}=${U.senior.id}.${Date.now()}.not-a-real-signature`;
    const res = await caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { cookie: forged, body: { action: "claim" } }), params(c.id));
    expect(res.status).toBe(401);
    expect(getCase(db, c.id)!.status).toBe("pending");
  });

  it("auditor can read cases and audit log but gets 403 on claim (and the denial is logged)", async () => {
    const c = insertCase(db);
    expect((await listCasesHandler(req("/api/kyc/cases", { userId: U.auditor.id }))).status).toBe(200);
    expect((await getCaseHandler(req(`/api/kyc/cases/${c.id}`, { userId: U.auditor.id }), params(c.id))).status).toBe(200);
    expect((await auditHandler(req("/api/kyc/audit", { userId: U.auditor.id }))).status).toBe(200);

    const res = await caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { userId: U.auditor.id, body: { action: "claim" } }), params(c.id));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
    expect(auditRows(db)).toMatchObject([{ action: "denied", actorUserId: U.auditor.id }]);
  });

  it("reviewer deciding a high-risk case via the API gets 403, regardless of what the UI shows", async () => {
    const c = insertCase(db, { riskLevel: "high", status: "in_review", assignedTo: U.reviewer.id });
    const res = await caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { userId: U.reviewer.id, body: { action: "approve" } }), params(c.id));
    expect(res.status).toBe(403);
    expect(getCase(db, c.id)!.status).toBe("in_review");
  });

  it("happy path returns the updated case; concurrent API claims produce one 200 and one 409", async () => {
    const c = insertCase(db);
    const [a, b] = await Promise.all([
      caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { userId: U.reviewer.id, body: { action: "claim" } }), params(c.id)),
      caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { userId: U.reviewer2.id, body: { action: "claim" } }), params(c.id)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(auditRows(db).filter((r) => r.action === "claim")).toHaveLength(1);
  });

  it("415 for non-JSON bodies, 400 for bad filters", async () => {
    const c = insertCase(db);
    const res = await caseActionHandler(req(`/api/kyc/cases/${c.id}/actions`, { userId: U.reviewer.id, body: { action: "claim" }, contentType: "text/plain" }), params(c.id));
    expect(res.status).toBe(415);
    expect((await listCasesHandler(req("/api/kyc/cases?status=bogus", { userId: U.reviewer.id }))).status).toBe(400);
  });
});
