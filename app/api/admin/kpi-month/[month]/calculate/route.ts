import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { calculateMonthlyKpi } from "../../../../../../lib/repositories/monthly-kpi";

export async function POST(_request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();return NextResponse.json(await calculateMonthlyKpi(params.month));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Calculation failed"},{status:500});}}
