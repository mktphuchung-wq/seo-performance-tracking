import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getContentUrls } from "../../../../lib/google";
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const rows = await getContentUrls(session.accessToken); const members = Object.values(rows.reduce<Record<string, { member_name: string; urls: number }>>((acc, row) => { acc[row.member_name] ??= { member_name: row.member_name, urls: 0 }; acc[row.member_name].urls += 1; return acc; }, {})); return NextResponse.json({ members }); }
