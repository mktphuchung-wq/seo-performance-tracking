import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange, normalizeDateRangeKey } from "../../../../lib/dates";
import { refreshPerformanceCache } from "../../../../lib/refresh";

function bodyString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ ok: false, error: "Unauthorized", errorMessage: "Unauthorized" }, { status: 401 });
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await request.json().catch(() => ({})) : Object.fromEntries(await request.formData());
    const requestedRange = bodyString(body, "range_key") || bodyString(body, "range") || bodyString(body, "rangeKey") || "current_month";
    const rangeKey = normalizeDateRangeKey(requestedRange);
    const range = getDateRange({ range: rangeKey, startDate: bodyString(body, "startDate"), endDate: bodyString(body, "endDate") });
    const result = await refreshPerformanceCache(session.accessToken, rangeKey, range, session.user.email);
    if (!contentType.includes("application/json")) {
      const qs = new URLSearchParams({ range: rangeKey });
      for (const [key, value] of Object.entries(body)) if (typeof value === "string" && value && !["returnTo", "range", "rangeKey"].includes(key)) qs.set(key, value);
      if (!result.ok && result.errorMessage) qs.set("refreshError", result.errorMessage);
      const requestedReturnTo = bodyString(body, "returnTo") || "";
      const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/admin";
      return NextResponse.redirect(new URL(`${returnTo}?${qs.toString()}`, request.url));
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    return NextResponse.json({ ok: false, error: message, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: message }, { status: 500 });
  }
}
