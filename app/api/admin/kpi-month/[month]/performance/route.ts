import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { refreshMonthlyPerformanceV2 } from "../../../../../../lib/performance/refresh-v2";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    if (!session.accessToken) throw new KpiApiError("GOOGLE_ACCESS_TOKEN_MISSING", "Google access token is missing. Sign out and sign in with consent again.", 401, null, true);
    assertKpiV2WriteEnvironment();
    const month = parseMonth(params.month);
    const body = await readJsonObject(request);
    const memberName = requireString(body.memberName, "memberName");
    const run = await runIdempotentKpiStep({
      step: "performance", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "performance_measurement_v3",
      operation: () => refreshMonthlyPerformanceV2({ month, accessToken: session.accessToken!, memberName }),
    });
    return apiSuccess({ performance: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Performance refresh failed"); }
}
