import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, optionalNumber, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { listMonthlyKpiAudit, saveManualComponent } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    const memberName = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    return apiSuccess({ components: (await listMonthlyKpiAudit(parseMonth(params.month), memberName)).components }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Component read failed"); }
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
    if (!["discipline", "social_video"].includes(body.componentKey)) throw new KpiApiError("VALIDATION_ERROR", "componentKey must be discipline or social_video.", 400, "componentKey");
    const scorePct = optionalNumber(body.scorePct, "scorePct");
    if (scorePct === null) throw new KpiApiError("VALIDATION_ERROR", "scorePct is required; missing must stay N/A.", 400, "scorePct");
    const run = await runIdempotentKpiStep({
      step: "review", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "manual_component_v2",
      operation: () => saveManualComponent({ month, memberName, componentKey: body.componentKey, scorePct, reason: body.reason ?? null, actor: session.user!.email! }),
    });
    return apiSuccess({ component: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Component save failed"); }
}
