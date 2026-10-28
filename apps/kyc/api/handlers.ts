import { NextResponse, type NextRequest } from "next/server";
import { queryAudit } from "@/platform/audit/log";
import { requireAppUser } from "@/platform/auth/server";
import type { AppUser } from "@/platform/auth/schema";
import { HttpError, readJson, withErrors } from "@/platform/http/errors";
import { getDb } from "@/apps/kyc/db";
import { KYC_APP } from "@/apps/kyc/domain/constants";
import { allowedActions } from "@/apps/kyc/domain/permissions";
import { getCase, isCaseStatus, isRiskLevel, listCases, performCaseAction } from "@/apps/kyc/domain/service";

type IdParams = { params: Promise<{ id: string }> };

/** Every KYC role can read; users without a KYC role get 403 (logged as "denied" by requireAppUser). */
function requireViewer(req: NextRequest): { db: ReturnType<typeof getDb>; user: AppUser } {
  const db = getDb();
  return { db, user: requireAppUser(db, req, KYC_APP) };
}

/** GET /api/kyc/cases?status=&risk= */
export const listCasesHandler = withErrors(async (req: NextRequest) => {
  const { db } = requireViewer(req);
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const risk = req.nextUrl.searchParams.get("risk") || undefined;
  if (status !== undefined && !isCaseStatus(status)) throw new HttpError(400, "invalid_filter", `Unknown status '${status}'`);
  if (risk !== undefined && !isRiskLevel(risk)) throw new HttpError(400, "invalid_filter", `Unknown risk level '${risk}'`);
  return NextResponse.json({ cases: listCases(db, { status, riskLevel: risk }) });
});

/** GET /api/kyc/cases/:id */
export const getCaseHandler = withErrors(async (req: NextRequest, { params }: IdParams) => {
  const { db, user } = requireViewer(req);
  const { id } = await params;
  const kase = getCase(db, id);
  if (!kase) throw new HttpError(404, "not_found", `Case ${id} not found`);
  return NextResponse.json({ case: kase, allowedActions: allowedActions(user, kase), history: queryAudit(db, { app: KYC_APP, caseId: id }) });
});

/** POST /api/kyc/cases/:id/actions  body: { action, reasonCode?, note? } */
export const caseActionHandler = withErrors(async (req: NextRequest, { params }: IdParams) => {
  const db = getDb();
  const user = requireAppUser(db, req, KYC_APP);
  const { id } = await params;
  const body = await readJson(req);
  const result = performCaseAction(db, user, id, body);
  if (!result.ok) throw new HttpError(result.error.status, result.error.code, result.error.message);
  return NextResponse.json({ case: result.case, auditId: result.auditId });
});

/** GET /api/kyc/audit?actor=&case=&action= */
export const auditHandler = withErrors(async (req: NextRequest) => {
  const { db } = requireViewer(req);
  const q = req.nextUrl.searchParams;
  return NextResponse.json({
    entries: queryAudit(db, {
      app: KYC_APP,
      actorUserId: q.get("actor") || undefined,
      caseId: q.get("case") || undefined,
      action: q.get("action") || undefined,
    }),
  });
});
