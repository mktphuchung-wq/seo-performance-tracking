import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { getMemberEmailMap } from "../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, parseMonth } from "../../../../lib/kpi/api-contract";
import { listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";

export async function GET(request: Request, { params }: { params: { month: string } }) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new KpiApiError("UNAUTHORIZED", "Sign-in is required.", 401);
    const requested = new URL(request.url).searchParams.get("member")?.trim() || undefined;
    const ownName = Object.entries(getMemberEmailMap()).find(([, email]) => email.toLowerCase() === session.user!.email!.toLowerCase())?.[0];
    if (!session.user.isAdmin && requested && requested !== ownName) throw new KpiApiError("MEMBER_DATA_FORBIDDEN", "Members can only view their own KPI.", 403, "member");
    const member = session.user.isAdmin ? requested : ownName;
    if (!session.user.isAdmin && !member) throw new KpiApiError("MEMBER_IDENTITY_NOT_CONFIGURED", "Member identity is not configured for this account.", 403);
    return apiSuccess(await listMonthlyKpiAudit(parseMonth(params.month), member), requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Member KPI read failed"); }
}
