import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { getSourcePipelineStatus } from "../../../../../lib/repositories/data-source";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    return apiOk(await getSourcePipelineStatus(), requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId, "Source status failed", 500);
  }
}
