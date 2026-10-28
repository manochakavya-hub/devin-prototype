import { NextResponse, type NextRequest } from "next/server";
import { queryAudit } from "@/platform/audit/log";
import { requireAppUser } from "@/platform/auth/server";
import { HttpError, readJson, withErrors } from "@/platform/http/errors";
import { getDb } from "@/apps/refunds/db";
import { REFUNDS_APP } from "@/apps/refunds/domain/constants";
import { allowedActions } from "@/apps/refunds/domain/permissions";
import { getRefund, isRefundStatus, listRefunds, performRefundAction } from "@/apps/refunds/domain/service";

type IdParams = { params: Promise<{ id: string }> };

/** Every refunds role can read; users without a refunds role get 403 (logged by requireAppUser). */
function requireViewer(req: NextRequest) {
  const db = getDb();
  return { db, user: requireAppUser(db, req, REFUNDS_APP) };
}

/** GET /api/refunds?status= */
export const listRefundsHandler = withErrors(async (req: NextRequest) => {
  const { db } = requireViewer(req);
  const status = req.nextUrl.searchParams.get("status") || undefined;
  if (status !== undefined && !isRefundStatus(status)) throw new HttpError(400, "invalid_filter", `Unknown status '${status}'`);
  return NextResponse.json({ refunds: listRefunds(db, { status }) });
});

/** GET /api/refunds/:id */
export const getRefundHandler = withErrors(async (req: NextRequest, { params }: IdParams) => {
  const { db, user } = requireViewer(req);
  const { id } = await params;
  const refund = getRefund(db, id);
  if (!refund) throw new HttpError(404, "not_found", `Refund ${id} not found`);
  return NextResponse.json({ refund, allowedActions: allowedActions(user, refund), history: queryAudit(db, { app: REFUNDS_APP, caseId: id }) });
});

/** POST /api/refunds/:id/actions  body: { action, reasonCode?, note? } */
export const refundActionHandler = withErrors(async (req: NextRequest, { params }: IdParams) => {
  const { db, user } = requireViewer(req);
  const { id } = await params;
  const body = await readJson(req);
  const result = performRefundAction(db, user, id, body);
  if (!result.ok) throw new HttpError(result.error.status, result.error.code, result.error.message);
  return NextResponse.json({ refund: result.refund, auditId: result.auditId });
});

/** GET /api/refunds/audit?actor=&case=&action= */
export const refundsAuditHandler = withErrors(async (req: NextRequest) => {
  const { db } = requireViewer(req);
  const q = req.nextUrl.searchParams;
  return NextResponse.json({
    entries: queryAudit(db, { app: REFUNDS_APP, actorUserId: q.get("actor") || undefined, caseId: q.get("case") || undefined, action: q.get("action") || undefined }),
  });
});
