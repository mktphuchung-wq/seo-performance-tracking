import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
import { refreshSourcePipeline } from "../../../../../lib/services/source-pipeline";

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
        error: "Thiếu phiên Google. Hãy đăng nhập lại để đọc Content Sheet.",
        code: "google_access_token_missing",
        requestId,
      },
      { status: 401 },
    );
  try {
    return apiOk(
      await refreshSourcePipeline({
        accessToken: session.accessToken,
        actor: session.user.email,
        requestId,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Làm mới dữ liệu thất bại");
  }
}
