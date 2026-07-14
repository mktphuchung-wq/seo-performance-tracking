import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../lib/env";
import { listProjectKpiV2Settings,saveProjectKpiV2Settings } from "../../../../lib/repositories/project-kpi-v2-settings";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403});return NextResponse.json({settings:await listProjectKpiV2Settings()});}
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403});try{assertKpiV2WriteEnvironment();const contentType=request.headers.get('content-type')??'';const body=contentType.includes('application/json')?await request.json():Object.fromEntries(await request.formData());const setting=(await saveProjectKpiV2Settings(body)).rows[0];if(!contentType.includes('application/json'))return NextResponse.redirect(new URL('/admin/monthly-kpi-settings',request.url),303);return NextResponse.json({setting});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Settings save failed'},{status:400});}}
