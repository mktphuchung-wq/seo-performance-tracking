import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { filterRowsForEmail, getContentUrls, getUrlDetail } from "../../../../lib/google";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); const rows = filterRowsForEmail(await getContentUrls(session.accessToken), session.user.email, session.user.isAdmin); const row = rows.find((r) => r.id === url.searchParams.get("id") || r.url === url.searchParams.get("url")); if (!row) return NextResponse.json({ error: "URL not found" }, { status: 404 }); return NextResponse.json(await getUrlDetail(row, session.accessToken, getDateRange({ range: url.searchParams.get("range"), startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate") }))); }
