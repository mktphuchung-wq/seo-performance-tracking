import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getContentUrls } from "../../../lib/google";
import { filterRowsForEmail } from "../../../lib/google";
import { getComparedPerformance } from "../../../lib/cache";
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData(); const rangeKey = String(form.get("range") || "28d");
  const range = getDateRange({ range: rangeKey, startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
  const all = await getContentUrls(session.accessToken); const rows = filterRowsForEmail(all, session.user.email, session.user.isAdmin);
  await getComparedPerformance(rows, session.accessToken, rangeKey, range, true);
  const qs = new URLSearchParams({ range: rangeKey }); if (form.get("startDate")) qs.set("startDate", String(form.get("startDate"))); if (form.get("endDate")) qs.set("endDate", String(form.get("endDate")));
  redirect(`${session.user.isAdmin ? "/admin" : "/dashboard"}?${qs.toString()}`);
}
