import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ ok: false, errorMessage: "This endpoint has been removed. Use POST /api/refresh/cache." }, { status: 410 }); }
