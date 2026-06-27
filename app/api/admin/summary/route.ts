import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { aggregateCompared } from "../../../../lib/growth";
import { getDbPerformance } from "../../../../lib/postgres";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); const rangeKey = url.searchParams.get("range") || "28d"; const range = getDateRange({ range: rangeKey }); const rows = await getDbPerformance(rangeKey, range); return NextResponse.json({ range, metrics: aggregateCompared(rows), rows }); }
