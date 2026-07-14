import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { saveShadowApproval } from "../../../../../../lib/repositories/shadow-evidence";

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    assertKpiV2WriteEnvironment();
    const month = parseMonth(params.month);
    const body = await readJsonObject(request);
    if (!["pm", "finance"].includes(body.role)) throw new KpiApiError("VALIDATION_ERROR", "role must be pm or finance.", 400, "role");
    if (!["pending", "approved", "rejected"].includes(body.status)) throw new KpiApiError("VALIDATION_ERROR", "Invalid approval status.", 400, "status");
    const memberName = requireString(body.memberName, "memberName");
    const run = await runIdempotentKpiStep({ step: "finalize", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "shadow_approval_v2",
      operation: () => saveShadowApproval({ month, memberName, role: body.role, status: body.status, note: body.note ?? null, actor: session.user!.email! }) });
    return apiSuccess({ approval: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Shadow approval failed"); }
}
