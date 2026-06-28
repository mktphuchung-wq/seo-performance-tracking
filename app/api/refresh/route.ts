import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { refreshPerformanceCache } from "../../../lib/refresh";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ ok: false, errorMessage: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const rangeKey = String(form.get("range") || "28d");
  const range = getDateRange({ range: rangeKey, startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") });
  const result = await refreshPerformanceCache(session.accessToken, rangeKey, range, session.user.email);
  const qs = new URLSearchParams({ range: rangeKey });
  for (const [key, value] of form.entries()) if (typeof value === "string" && value && !["returnTo", "range"].includes(key)) qs.set(key, value);
  if (!result.ok && result.errorMessage) qs.set("refreshError", result.errorMessage);
  const requestedReturnTo = String(form.get("returnTo") || "");
  const returnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/admin";
  redirect(`${returnTo}?${qs.toString()}`);
}
