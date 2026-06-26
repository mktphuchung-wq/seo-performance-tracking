import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { aggregate, getContentUrls, getUrlPerformance } from "../../../../lib/google";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); const range = getDateRange({ range: url.searchParams.get("range") }); const rows = await getUrlPerformance(await getContentUrls(session.accessToken), session.accessToken, range); return NextResponse.json({ range, metrics: aggregate(rows), rows }); }
