import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { aggregate, filterRowsForEmail, getContentUrls, getUrlPerformance } from "../../../../lib/google";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); const range = getDateRange({ range: url.searchParams.get("range") }); const rows = filterRowsForEmail(await getContentUrls(session.accessToken), session.user.email, session.user.isAdmin); const performance = await getUrlPerformance(rows, session.accessToken, range); return NextResponse.json({ range, metrics: aggregate(performance), rows: performance }); }
