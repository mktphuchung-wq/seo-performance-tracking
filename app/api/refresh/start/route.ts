import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { createRefreshJob } from "../../../../lib/refresh";
export async function POST(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const body = await request.json().catch(()=>({})); const rangeKey = String(body.range || "28d"); const range = getDateRange({ range: rangeKey, startDate: body.startDate, endDate: body.endDate }); return NextResponse.json({ range, ...(await createRefreshJob(rangeKey, range, session.user.email)) }); }
