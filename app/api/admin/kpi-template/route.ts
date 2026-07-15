import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../lib/env";
import { listKpiTemplates,saveKpiTemplate } from "../../../../lib/repositories/kpi-template";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({templates:await listKpiTemplates()});}
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertUnifiedWriteEnvironment();return NextResponse.json(await saveKpiTemplate({...await request.json(),actor:session.user.email}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"KPI Template save failed"},{status:400});}}
