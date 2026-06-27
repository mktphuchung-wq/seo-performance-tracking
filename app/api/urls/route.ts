import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { filterRowsForEmail } from "../../../lib/google";
import { getDbContentUrls } from "../../../lib/postgres";
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const rows = filterRowsForEmail(await getDbContentUrls(), session.user.email, session.user.isAdmin); return NextResponse.json({ rows }); }
