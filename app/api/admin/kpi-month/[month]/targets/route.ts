import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, optionalNumber, parseMonth, readJsonObject, requireIdempotencyKey, requireString } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { listMonthlyKpiAudit, upsertMemberMonthlyTarget } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    const memberName = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    const audit = await listMonthlyKpiAudit(parseMonth(params.month), memberName);
    return apiSuccess({ targets: audit.targets, allocations: audit.allocations }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Target read failed"); }
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
    const targetUnits = optionalNumber(body.targetUnits, "targetUnits");
    if (targetUnits === null) throw new KpiApiError("VALIDATION_ERROR", "targetUnits is required.", 400, "targetUnits");
    const allocations = body.allocations === undefined ? undefined : Array.isArray(body.allocations) ? body.allocations.map((allocation: any) => ({ project: requireString(allocation.project, "allocations.project"), units: optionalNumber(allocation.units, "allocations.units") ?? 0, reason: allocation.reason ?? null })) : (() => { throw new KpiApiError("VALIDATION_ERROR", "allocations must be an array.", 400, "allocations"); })();
    const run = await runIdempotentKpiStep({
      step: "target", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "member_target_v2",
      operation: () => upsertMemberMonthlyTarget({ month, memberName, memberEmail: body.memberEmail ?? null, targetUnits,
        baseTargetUnits: optionalNumber(body.baseTargetUnits, "baseTargetUnits"), activeWorkdayRatio: optionalNumber(body.activeWorkdayRatio, "activeWorkdayRatio"),
        adjustmentReason: body.adjustmentReason ?? null, notes: body.notes ?? null, allocations, actor: session.user.email }),
    });
    return apiSuccess({ target: run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Target save failed"); }
}
