import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { refreshPerformanceCache } from "../../../../lib/refresh";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ ok: false, errorMessage: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const rangeKey = String(body.range || body.rangeKey || "28d");
    const range = getDateRange({ range: rangeKey, startDate: body.startDate ? String(body.startDate) : undefined, endDate: body.endDate ? String(body.endDate) : undefined });
    const result = await refreshPerformanceCache(session.accessToken, rangeKey, range, session.user.email);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: error instanceof Error ? error.message : "Refresh failed" }, { status: 500 });
  }
}
