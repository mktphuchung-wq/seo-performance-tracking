import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { filterRowsForEmail, getContentUrls } from "../../../lib/google";
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const rows = filterRowsForEmail(await getContentUrls(session.accessToken), session.user.email, session.user.isAdmin); return NextResponse.json({ rows }); }
