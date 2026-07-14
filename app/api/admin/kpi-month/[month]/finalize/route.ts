import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { calculateMemberFinal } from "../../../../../../lib/repositories/monthly-kpi";
import { finalizeAndLockMemberMonth } from "../../../../../../lib/repositories/month-lock";

export async function POST(request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();const body=await request.json();const result=await calculateMemberFinal({month:params.month,memberName:body.memberName,acknowledgeMissingPerformance:body.acknowledgeMissingPerformance,missingPerformanceReason:body.missingPerformanceReason});return NextResponse.json({result:await finalizeAndLockMemberMonth({month:params.month,memberName:body.memberName,result,actor:session.user.email,acknowledgementReason:body.missingPerformanceReason})});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Finalization failed"},{status:400});}}
