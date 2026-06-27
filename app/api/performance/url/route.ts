import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { filterRowsForEmail } from "../../../../lib/google";
import { getUrlDetailFromDb } from "../../../../lib/postgres";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); const rangeKey = url.searchParams.get("range") || "28d"; const detail = await getUrlDetailFromDb(url.searchParams.get("id") || url.searchParams.get("url") || "", rangeKey, getDateRange({ range: rangeKey, startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate") })); if (!detail || !filterRowsForEmail([detail.overview], session.user.email, session.user.isAdmin).length) return NextResponse.json({ error: "URL not found" }, { status: 404 }); return NextResponse.json(detail); }
