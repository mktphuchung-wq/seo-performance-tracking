import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { reopenLockedMemberMonth } from "../../../../../../lib/repositories/month-lock";

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    assertKpiV2WriteEnvironment();
    const month = parseMonth(params.month);
    const body = await readJsonObject(request);
    const memberName = requireString(body.memberName, "memberName");
    const resultId = requireString(body.resultId, "resultId");
    const reason = requireString(body.reason, "reason");
    const run = await runIdempotentKpiStep({
      step: "reopen", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "monthly_final_v2",
      operation: () => reopenLockedMemberMonth({ resultId, reason, actor: session.user!.email! }),
    });
    return apiSuccess({ result: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Reopen failed"); }
}
