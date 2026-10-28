import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { SESSION_COOKIE, createSessionToken } from "@/platform/auth/session";
import { setDbForTesting } from "@/apps/refunds/db";
import { getRefundHandler, listRefundsHandler, refundActionHandler, refundsAuditHandler } from "@/apps/refunds/api/handlers";
import { getRefund } from "@/apps/refunds/domain/service";
import { KYC_ONLY, R, auditRows, createTestDb, insertRefund } from "@/apps/refunds/test/fixtures";

let db: Db;
beforeEach(() => {
  db = createTestDb();
  setDbForTesting(db);
});
afterEach(() => setDbForTesting(undefined));

function req(url: string, userId?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (userId) headers.cookie = `${SESSION_COOKIE}=${createSessionToken(userId)}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, { method: body !== undefined ? "POST" : "GET", headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("refunds API enforces auth server-side", () => {
  it("401 without a session", async () => {
    expect((await listRefundsHandler(req("/api/refunds"))).status).toBe(401);
  });

  it("403 for a user with a KYC role but no refunds role, logged as denied for the refunds app", async () => {
    const r = insertRefund(db);
    expect((await listRefundsHandler(req("/api/refunds", KYC_ONLY.id))).status).toBe(403);
    expect((await refundActionHandler(req(`/api/refunds/${r.id}/actions`, KYC_ONLY.id, { action: "approve" }), params(r.id))).status).toBe(403);
    expect(getRefund(db, r.id)!.status).toBe("requested");
    expect(auditRows(db).map((a) => [a.app, a.action, a.actorUserId])).toEqual([
      ["refunds", "denied", KYC_ONLY.id],
      ["refunds", "denied", KYC_ONLY.id],
    ]);
  });

  it("auditor can read but not act", async () => {
    const r = insertRefund(db);
    expect((await getRefundHandler(req(`/api/refunds/${r.id}`, R.auditor.id), params(r.id))).status).toBe(200);
    expect((await refundsAuditHandler(req("/api/refunds/audit", R.auditor.id))).status).toBe(200);
    expect((await refundActionHandler(req(`/api/refunds/${r.id}/actions`, R.auditor.id, { action: "approve" }), params(r.id))).status).toBe(403);
  });

  it("agent over the limit gets 403 via the API; finance approver succeeds", async () => {
    const r = insertRefund(db, { amountCents: 75_000 });
    expect((await refundActionHandler(req(`/api/refunds/${r.id}/actions`, R.agent.id, { action: "approve" }), params(r.id))).status).toBe(403);
    const ok = await refundActionHandler(req(`/api/refunds/${r.id}/actions`, R.approver.id, { action: "approve" }), params(r.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).refund.status).toBe("approved");
  });

  it("GET detail returns the actions this user may take", async () => {
    const r = insertRefund(db);
    const body = await (await getRefundHandler(req(`/api/refunds/${r.id}`, R.agent.id), params(r.id))).json();
    expect(body.allowedActions).toEqual(["approve", "reject"]);
  });
});
