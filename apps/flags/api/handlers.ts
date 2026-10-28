import { NextResponse, type NextRequest } from "next/server";
import { queryAudit } from "@/platform/audit/log";
import { requireAppUser } from "@/platform/auth/server";
import { HttpError, readJson, withErrors } from "@/platform/http/errors";
import { getDb } from "@/apps/flags/db";
import { FLAGS_APP } from "@/apps/flags/domain/constants";
import { createFlag, flagCapabilities, getFlag, listFlags, performFlagAction, type FlagResult } from "@/apps/flags/domain/service";

type KeyParams = { params: Promise<{ key: string }> };

/** Every flags role can read; users without a flags role get 403 (logged by requireAppUser). */
function requireViewer(req: NextRequest) {
  const db = getDb();
  return { db, user: requireAppUser(db, req, FLAGS_APP) };
}

function unwrap(result: FlagResult, status = 200) {
  if (!result.ok) throw new HttpError(result.error.status, result.error.code, result.error.message);
  return NextResponse.json({ flag: result.flag, auditId: result.auditId }, { status });
}

/** GET /api/flags */
export const listFlagsHandler = withErrors(async (req: NextRequest) => {
  const { db } = requireViewer(req);
  return NextResponse.json({ flags: listFlags(db) });
});

/** POST /api/flags  body: { key, description } */
export const createFlagHandler = withErrors(async (req: NextRequest) => {
  const { db, user } = requireViewer(req);
  return unwrap(createFlag(db, user, await readJson(req)), 201);
});

/** GET /api/flags/:key */
export const getFlagHandler = withErrors(async (req: NextRequest, { params }: KeyParams) => {
  const { db, user } = requireViewer(req);
  const { key } = await params;
  const flag = getFlag(db, key);
  if (!flag) throw new HttpError(404, "not_found", `Flag ${key} not found`);
  return NextResponse.json({ flag, can: flagCapabilities(user, flag), history: queryAudit(db, { app: FLAGS_APP, caseId: key }) });
});

/** POST /api/flags/:key/actions  body: { action: "enable" | "disable" | "archive", environment?, reason? } */
export const flagActionHandler = withErrors(async (req: NextRequest, { params }: KeyParams) => {
  const { db, user } = requireViewer(req);
  const { key } = await params;
  return unwrap(performFlagAction(db, user, key, await readJson(req)));
});
