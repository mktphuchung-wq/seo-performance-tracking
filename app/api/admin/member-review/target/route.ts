import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
import { authOptions } from "../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../lib/env";
import { upsertMonthlyTarget } from "../../../../../lib/repositories/monthly-kpi";

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
        target: (
          await upsertMonthlyTarget({ ...body, actor: session.user.email })
        ).rows[0],
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Member target save failed");
  }
}
