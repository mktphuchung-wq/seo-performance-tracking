import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getContentUrls } from "../../../../lib/google";
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const rows = await getContentUrls(session.accessToken); const projects = Object.values(rows.reduce<Record<string, { project: string; urls: number; gscProperty?: string }>>((acc, row) => { acc[row.project] ??= { project: row.project, urls: 0, gscProperty: row.gscProperty }; acc[row.project].urls += 1; return acc; }, {})); return NextResponse.json({ projects }); }
