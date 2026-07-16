import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
import { authOptions } from "../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../lib/env";
import { refreshPerformanceService } from "../../../../../lib/services/performance-service";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  if (!session.accessToken)
    return NextResponse.json(
      {
        ok: false,
        error: "Google access token is missing.",
        code: "google_token_missing",
        requestId,
      },
      { status: 401 },
    );
  try {
    assertUnifiedWriteEnvironment();
    const body = await request.json();
    return apiOk(
      await refreshPerformanceService({
        month: body.month,
        accessToken: session.accessToken,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Performance refresh failed");
  }
}
