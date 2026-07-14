import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, requireIdempotencyKey } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { syncKpiV2WorkSource } from "../../../../../../lib/sync/kpi-v2";

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    if (!session.accessToken) throw new KpiApiError("GOOGLE_ACCESS_TOKEN_MISSING", "Google access token is missing. Sign out and sign in with consent again.", 401, null, true);
    const month = parseMonth(params.month);
    const search = new URL(request.url).searchParams;
    const dryRun = search.get("dryRun") !== "false";
    const stage = search.get("stage") === "events" ? "events" : "raw";
    const approvalReason = search.get("approvalReason");
    const payload = { month, stage, approvalReason };
    if (dryRun) return apiSuccess({ month, stage: "dry_run", ...(await syncKpiV2WorkSource({ accessToken: session.accessToken, actor: session.user.email, dryRun: true })) }, requestId);
    const run = await runIdempotentKpiStep({
      step: "sync", month, actor: session.user.email, requestId, idempotencyKey: requireIdempotencyKey(request),
      requestPayload: payload, ruleVersion: "source_reconciliation_v2",
      operation: () => syncKpiV2WorkSource({ accessToken: session.accessToken!, actor: session.user!.email!, dryRun: false, persistEvents: stage === "events", approvalReason }),
    });
    return apiSuccess({ month, stage, sync: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "KPI source sync failed"); }
}
