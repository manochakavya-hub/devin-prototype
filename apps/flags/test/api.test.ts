import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/platform/db/client";
import { SESSION_COOKIE, createSessionToken } from "@/platform/auth/session";
import { setDbForTesting } from "@/apps/flags/db";
import { createFlagHandler, flagActionHandler, getFlagHandler, listFlagsHandler } from "@/apps/flags/api/handlers";
import { getFlag } from "@/apps/flags/domain/service";
import { F, OTHER_APP_ONLY, auditRows, createTestDb, insertFlag } from "@/apps/flags/test/fixtures";

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
const params = (key: string) => ({ params: Promise.resolve({ key }) });

describe("flags API enforces auth server-side", () => {
  it("401 without a session; 403 (logged) for a user with no flags role", async () => {
    expect((await listFlagsHandler(req("/api/flags"))).status).toBe(401);
    expect((await createFlagHandler(req("/api/flags", OTHER_APP_ONLY.id, { key: "x_flag", description: "x" }))).status).toBe(403);
    expect(auditRows(db).map((a) => [a.app, a.action])).toEqual([["flags", "denied"]]);
  });

  it("engineer creates via the API (201) and gets 403 on production", async () => {
    const res = await createFlagHandler(req("/api/flags", F.engineer.id, { key: "api_flag", description: "From the API" }));
    expect(res.status).toBe(201);
    const prod = await flagActionHandler(req("/api/flags/api_flag/actions", F.engineer.id, { action: "enable", environment: "production", reason: "go" }), params("api_flag"));
    expect(prod.status).toBe(403);
    expect(getFlag(db, "api_flag")!.productionEnabled).toBe(false);
  });

  it("release manager enables production via the API", async () => {
    const f = insertFlag(db);
    const res = await flagActionHandler(req(`/api/flags/${f.key}/actions`, F.release.id, { action: "enable", environment: "production", reason: "Launch" }), params(f.key));
    expect(res.status).toBe(200);
    expect((await res.json()).flag.productionEnabled).toBe(true);
  });

  it("auditor can read a flag and its capabilities are all false", async () => {
    const f = insertFlag(db);
    const body = await (await getFlagHandler(req(`/api/flags/${f.key}`, F.auditor.id), params(f.key))).json();
    expect(body.can).toEqual({ staging: false, production: false, archive: false });
    expect((await flagActionHandler(req(`/api/flags/${f.key}/actions`, F.auditor.id, { action: "archive" }), params(f.key))).status).toBe(403);
  });
});
