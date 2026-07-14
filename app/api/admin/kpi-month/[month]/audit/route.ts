import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth } from "../../../../../../lib/kpi/api-contract";
import { listMonthlyKpiAudit } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    const memberName = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    return apiSuccess(await listMonthlyKpiAudit(parseMonth(params.month), memberName), requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Audit read failed"); }
}
