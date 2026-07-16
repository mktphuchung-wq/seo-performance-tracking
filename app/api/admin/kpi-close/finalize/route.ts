import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../lib/env";
import {
  calculateMemberFinal,
  calculateMonthlyKpi,
} from "../../../../../lib/repositories/monthly-kpi";
import { finalizeAndLockMemberMonth } from "../../../../../lib/repositories/month-lock";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    assertUnifiedWriteEnvironment();
    const body = await request.json();
    await calculateMonthlyKpi(body.month);
    const result = await calculateMemberFinal({
      month: body.month,
      memberName: body.memberName,
      acknowledgeMissingPerformance: body.acknowledgeMissingPerformance,
      missingPerformanceReason: body.missingPerformanceReason,
    });
    return apiOk(
      {
        result: await finalizeAndLockMemberMonth({
          month: body.month,
          memberName: body.memberName,
          result,
          actor: session.user.email,
          acknowledgementReason: body.missingPerformanceReason,
        }),
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "KPI finalization failed");
  }
}
