import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
import { authOptions } from "../../../../../lib/auth";
import { getSourcePipelineStatus } from "../../../../../lib/repositories/data-source";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    return apiOk(
      { performance: (await getSourcePipelineStatus()).performance },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Performance status failed", 500);
  }
}
