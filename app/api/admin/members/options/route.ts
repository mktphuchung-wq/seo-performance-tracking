import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { apiErrorResponse, apiOk, requestIdFor } from "../../../../../lib/api/errors";
import { listMemberOptions } from "../../../../../lib/repositories/member-options";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json({ ok: false, error: "Không có quyền truy cập", code: "forbidden", requestId }, { status: 403 });
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const rawScope = url.searchParams.get("scope");
    const scope = rawScope === "performance" || rawScope === "close" ? rawScope : "review";
    return apiOk({ members: await listMemberOptions(month, scope) }, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId, "Không thể tải danh sách thành viên", 500);
  }
}
