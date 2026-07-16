import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../lib/api/errors";
import { authOptions } from "../../../../lib/auth";
import { listCanonicalDataSource } from "../../../../lib/repositories/data-source";
import { assertUnifiedSchemaReady } from "../../../../lib/schema-readiness";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    await assertUnifiedSchemaReady();
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 100);
    return apiOk(
      await listCanonicalDataSource({
        month: url.searchParams.get("month") ?? undefined,
        memberName: url.searchParams.get("member") ?? undefined,
        project: url.searchParams.get("project") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 100,
      }),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Data Source load failed", 500);
  }
}
