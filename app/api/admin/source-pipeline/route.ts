import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import {
  commitSourcePipeline,
  previewSourcePipeline,
} from "../../../../lib/services/source-pipeline";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../lib/api/errors";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "commit")
      return apiOk(
        await commitSourcePipeline({
          actor: session.user.email,
          approvalReason: String(body.approvalReason ?? ""),
          previewRunId: String(body.previewRunId ?? ""),
          idempotencyKey: String(body.idempotencyKey ?? ""),
        }),
        requestId,
      );
    if (!session.accessToken)
      return NextResponse.json(
        {
          ok: false,
          error: "Google access token is missing.",
          code: "google_access_token_missing",
          requestId,
        },
        { status: 401 },
      );
    return apiOk(
      await previewSourcePipeline({
        accessToken: session.accessToken,
        actor: session.user.email,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Source pipeline failed");
  }
}
