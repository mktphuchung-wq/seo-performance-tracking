import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { refreshMonthlyPerformanceV2 } from "../../../../../../lib/performance/refresh-v2";

export async function POST(_request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403});if(!session.accessToken)return NextResponse.json({error:'Google access token is missing.'},{status:401});try{assertKpiV2WriteEnvironment();return NextResponse.json(await refreshMonthlyPerformanceV2({month:params.month,accessToken:session.accessToken}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Performance refresh failed'},{status:500});}}
