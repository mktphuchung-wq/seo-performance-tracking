import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({ok:false,error:"Legacy range refresh is read-only. Use POST /api/admin/performance."},{status:410});}
