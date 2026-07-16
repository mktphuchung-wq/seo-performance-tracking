import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { listProjectOptions } from "../../../../../lib/repositories/project-settings";
import { listSearchConsoleProperties } from "../../../../../lib/google";
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
      { ok: false, error: "Bạn không có quyền thực hiện thao tác này.", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    const options = await listProjectOptions();
    const gscProperties = session.accessToken
      ? await listSearchConsoleProperties(session.accessToken)
      : [];
    return apiOk({ options, gscProperties }, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId, "Không thể tải danh sách dự án", 500);
  }
}
