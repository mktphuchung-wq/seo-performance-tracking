import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
export async function GET() { const session = await getServerSession(authOptions); if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const rows = await query("select * from refresh_runs order by created_at desc limit 10").catch(() => ({ rows: [] })); return NextResponse.json({ jobs: rows.rows }); }
