import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { commitSourcePipeline } from "../../../../../lib/services/source-pipeline";
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
    const body = await request.json();
    return apiOk(
      await commitSourcePipeline({
        actor: session.user.email,
        previewRunId: String(body.previewRunId ?? ""),
        approvalReason: String(body.approvalReason ?? ""),
        idempotencyKey: String(body.idempotencyKey ?? ""),
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Source commit failed");
  }
}
