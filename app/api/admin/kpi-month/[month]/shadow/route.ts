import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { listMonthlyKpiAudit } from "../../../../../../lib/repositories/monthly-kpi";
import { replaceShadowDifferences } from "../../../../../../lib/repositories/shadow-evidence";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    const memberName = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    const audit = await listMonthlyKpiAudit(parseMonth(params.month), memberName);
    return apiSuccess({ differences: audit.differences, approvals: audit.approvals }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Shadow evidence read failed"); }
}

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    assertKpiV2WriteEnvironment();
    const month = parseMonth(params.month);
    const body = await readJsonObject(request);
    const memberName = requireString(body.memberName, "memberName");
    if (!Array.isArray(body.rows)) throw new KpiApiError("VALIDATION_ERROR", "rows must be an array.", 400, "rows");
    const run = await runIdempotentKpiStep({ step: "review", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "shadow_reconciliation_v2",
      operation: () => replaceShadowDifferences({ month, memberName, rows: body.rows, actor: session.user!.email! }) });
    return apiSuccess({ shadow: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Shadow evidence save failed"); }
}
