import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { createRefreshJob } from "../../../../lib/refresh";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rangeKey = String(body.range_key || body.range || "28d");
  const range = getDateRange({ range: rangeKey, startDate: body.start_date || body.startDate, endDate: body.end_date || body.endDate });
  const job = await createRefreshJob(rangeKey, range, session.user.email);
  if (job.totalUrls === 0) return NextResponse.json({ error: "No URLs found. Please run Sync URLs from Sheet first.", range, ...job }, { status: 400 });
  return NextResponse.json({ range, ...job });
}
