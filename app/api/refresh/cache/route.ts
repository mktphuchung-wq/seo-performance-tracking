import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange, normalizeDateRangeKey } from "../../../../lib/dates";
import { refreshPerformanceCache } from "../../../../lib/refresh";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ ok: false, errorMessage: "Unauthorized" }, { status: 401 });
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await request.json().catch(() => ({})) : Object.fromEntries(await request.formData());
    const rangeKey = normalizeDateRangeKey(String(body.range || body.rangeKey || "current_month"));
    const range = getDateRange({ range: rangeKey, startDate: body.startDate ? String(body.startDate) : undefined, endDate: body.endDate ? String(body.endDate) : undefined });
    const result = await refreshPerformanceCache(session.accessToken, rangeKey, range, session.user.email);
    if (!contentType.includes("application/json")) {
      const qs = new URLSearchParams({ range: rangeKey });
      for (const [key, value] of Object.entries(body)) if (typeof value === "string" && value && !["returnTo", "range"].includes(key)) qs.set(key, value);
      if (!result.ok && result.errorMessage) qs.set("refreshError", result.errorMessage);
      const requestedReturnTo = String(body.returnTo || "");
      const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/admin";
      return NextResponse.redirect(new URL(`${returnTo}?${qs.toString()}`, request.url));
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: error instanceof Error ? error.message : "Refresh failed" }, { status: 500 });
  }
}
