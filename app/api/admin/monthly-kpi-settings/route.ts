import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({error:"Monthly KPI Settings was consolidated into Project Settings. Use POST /api/admin/project-settings."},{status:410});}
