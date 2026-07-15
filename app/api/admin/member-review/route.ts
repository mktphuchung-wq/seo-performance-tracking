import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../lib/api/errors";
import { authOptions } from "../../../../lib/auth";
import { listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";

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
    const month =
      url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    return apiOk(
      await listMonthlyKpiAudit(
        month,
        url.searchParams.get("member") ?? undefined,
      ),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Member Review load failed", 500);
  }
}
