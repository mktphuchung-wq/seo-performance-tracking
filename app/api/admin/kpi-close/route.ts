import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../lib/api/errors";
export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    const url = new URL(request.url);
    return apiOk(
      await listMonthlyKpiAudit(
        url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7),
        url.searchParams.get("member") ?? undefined,
      ),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "KPI Close load failed", 500);
  }
}
