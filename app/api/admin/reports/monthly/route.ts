import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../lib/auth";
import { requestIdFor } from "../../../../../lib/api/errors";
import { renderMonthlyHtmlReport } from "../../../../../lib/reports/monthly-html-report";
import { getAdminOverview } from "../../../../../lib/services/admin-overview-service";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) return NextResponse.json(
    { ok: false, code: "forbidden", message: "Forbidden", requestId },
    { status: 403, headers: { "x-request-id": requestId } },
  );
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const data = await getAdminOverview({
      month,
      project: url.searchParams.get("project") || undefined,
      member: url.searchParams.get("member") || undefined,
    });
    return new NextResponse(renderMonthlyHtmlReport(data), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="seo-kpi-${month}.html"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "report_failed", message: error instanceof Error ? error.message : "Report failed", requestId }, { status: 500 });
  }
}
