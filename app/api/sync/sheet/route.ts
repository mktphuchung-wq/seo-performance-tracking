import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({ok:false,error:"Legacy Sheet sync is read-only. Use POST /api/admin/source-pipeline."},{status:410});}
