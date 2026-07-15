import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../lib/env";
import { saveManualComponent } from "../../../../../lib/repositories/monthly-kpi";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
export async function PUT(request: Request) {
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
    return apiOk(
      {
        social: await saveManualComponent({
          ...body,
          componentKey: "social_video",
          actor: session.user.email,
        }),
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Social + Video save failed");
  }
}
