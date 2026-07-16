import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../lib/api/errors";
import { authOptions } from "../../../../lib/auth";
import { listCanonicalDataSource } from "../../../../lib/repositories/data-source";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    return apiOk(
      await listCanonicalDataSource({
        month: url.searchParams.get("month") ?? undefined,
        memberName: url.searchParams.get("member") ?? undefined,
        limit: Number.isFinite(limit) ? limit : 500,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Data Source load failed", 500);
  }
}
