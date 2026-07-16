import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { previewSourcePipeline } from "../../../../../lib/services/source-pipeline";
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
  try {
    return apiOk(
      await previewSourcePipeline({
        accessToken: session.accessToken,
        actor: session.user.email,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Source preview failed");
  }
}
