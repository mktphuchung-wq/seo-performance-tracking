import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { refreshStatus } from "../../../../lib/refresh";
export async function GET(request: Request) { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); return NextResponse.json({ jobs: await refreshStatus(url.searchParams.get("jobId") || undefined) }); }
