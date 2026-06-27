import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { syncSheetToDb } from "../../../../lib/refresh";
export async function POST() { const session = await getServerSession(authOptions); if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json(await syncSheetToDb(session.accessToken)); }
