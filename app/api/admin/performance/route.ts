import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../lib/env";
import { getPerformanceWorkspace,refreshPerformanceService } from "../../../../lib/services/performance-service";

export async function GET(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});const url=new URL(request.url);return NextResponse.json(await getPerformanceWorkspace({asOfMonth:url.searchParams.get("month")??new Date().toISOString().slice(0,7),memberName:url.searchParams.get("member")??undefined}));}
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});if(!session.accessToken)return NextResponse.json({error:"Google access token is missing."},{status:401});try{assertUnifiedWriteEnvironment();const body=await request.json();return NextResponse.json(await refreshPerformanceService({month:body.month,accessToken:session.accessToken}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Performance Service failed"},{status:400});}}
