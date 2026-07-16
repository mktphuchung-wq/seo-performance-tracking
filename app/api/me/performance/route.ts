import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { resolveMemberNameByEmail } from "../../../../lib/member-identity";
import { getPerformanceWorkspace } from "../../../../lib/services/performance-service";

export async function GET(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email)return NextResponse.json({error:"Unauthorized"},{status:401});const memberName=await resolveMemberNameByEmail(session.user.email);if(!memberName)return NextResponse.json({error:"Member identity is not configured"},{status:403});const month=new URL(request.url).searchParams.get("month")??new Date().toISOString().slice(0,7);return NextResponse.json(await getPerformanceWorkspace({asOfMonth:month,memberName}));}
