import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { createRefreshJob } from "../../../../lib/refresh";

export async function POST(request: Request) {
  console.log("/api/refresh/start request received");
  try {
    if (!process.env.DATABASE_URL) {
      console.error("/api/refresh/start missing DATABASE_URL");
      return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase() ?? null;
    const isAdmin = Boolean(session?.user?.isAdmin);
    console.log("/api/refresh/start current user email", email);
    console.log("/api/refresh/start isAdmin", isAdmin);

    if (!email || !session?.accessToken || !isAdmin) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rangeKey = String(body.range_key || body.range || "28d");
    const range = getDateRange({ range: rangeKey, startDate: body.start_date || body.startDate, endDate: body.end_date || body.endDate });
    const job = await createRefreshJob(rangeKey, range, email);

    console.log("/api/refresh/start active URL count", job.totalUrls);
    console.log("/api/refresh/start missing gsc_property count", job.missingGscPropertyCount ?? 0);

    if (job.totalUrls === 0) {
      return NextResponse.json({ ok: false, error: "No active URLs found. Run Sync URLs from Sheet first.", range, ...job }, { status: 400 });
    }
    if (job.blockedProjects?.length) {
      return NextResponse.json({ ok: false, error: "Some URLs are missing gsc_property", projects: job.blockedProjects, range, ...job }, { status: 400 });
    }
    if (!job.jobId) {
      console.error("/api/refresh/start job insert failure", job);
      return NextResponse.json({ ok: false, error: "Refresh job insert failed", range, ...job }, { status: 500 });
    }

    console.log("/api/refresh/start job insert success", true);
    console.log("/api/refresh/start created job_id", job.jobId);
    return NextResponse.json({ ok: true, jobId: job.jobId, totalUrls: job.totalUrls, itemCount: job.itemCount, range });
  } catch (error) {
    console.error("/api/refresh/start unexpected error", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unexpected refresh start error" }, { status: 500 });
  }
}
