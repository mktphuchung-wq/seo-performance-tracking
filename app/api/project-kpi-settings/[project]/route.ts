import { NextResponse } from "next/server";
export async function PATCH(){return NextResponse.json({error:"Legacy Project KPI Settings is read-only. Use POST /api/admin/project-settings."},{status:410});}
