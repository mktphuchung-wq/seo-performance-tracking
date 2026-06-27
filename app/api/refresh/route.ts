import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { createRefreshJob } from "../../../lib/refresh";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const rangeKey = String(form.get("range") || "28d");
  const range = getDateRange({ range: rangeKey, startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
  const job = await createRefreshJob(rangeKey, range, session.user.email);
  const qs = new URLSearchParams({ range: rangeKey });
  for (const [key, value] of form.entries()) if (typeof value === "string" && value && !["returnTo", "range"].includes(key)) qs.set(key, value);
  if (job.totalUrls === 0) qs.set("refreshError", "No URLs found. Run Sync URLs from Sheet first.");
  if (job.blockedProjects?.length) qs.set("refreshError", `Some projects are missing GSC mapping. Check PROJECT_GSC_MAP. Affected projects: ${job.blockedProjects.join(", ")}`);
  const requestedReturnTo = String(form.get("returnTo") || "");
  const fallback = session.user.isAdmin ? "/admin" : "/dashboard";
  const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : fallback;
  redirect(`${returnTo}?${qs.toString()}`);
}
