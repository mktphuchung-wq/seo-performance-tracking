import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth, readJsonObject, requireIdempotencyKey } from "../../../../../../lib/kpi/api-contract";
import { runIdempotentKpiStep } from "../../../../../../lib/repositories/kpi-runs";
import { listQualityReviewQueue, saveQualityReview } from "../../../../../../lib/repositories/quality-reviews";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    const memberName = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    return apiSuccess({ reviews: await listQualityReviewQueue(parseMonth(params.month), memberName) }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Review queue failed"); }
}

export async function POST(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    assertKpiV2WriteEnvironment();
    const month = parseMonth(params.month);
    const body = await readJsonObject(request);
    const reviews = Array.isArray(body.reviews) ? body.reviews : [body];
    if (!reviews.length) throw new KpiApiError("VALIDATION_ERROR", "At least one review is required.", 400, "reviews");
    const memberName = typeof body.memberName === "string" ? body.memberName.trim() : null;
    const run = await runIdempotentKpiStep({
      step: "review", month, memberName, actor: session.user.email, requestId,
      idempotencyKey: requireIdempotencyKey(request), requestPayload: body, ruleVersion: "quality_new_content_v3",
      operation: async () => {
        const saved = [];
        for (const review of reviews) saved.push(await saveQualityReview({ ...review, reviewer: session.user!.email! }));
        return { reviews: saved };
      },
    });
    return apiSuccess({ ...run.result, replayed: run.replayed, runId: run.runId }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Review save failed"); }
}
