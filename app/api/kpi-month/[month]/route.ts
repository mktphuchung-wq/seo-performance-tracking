import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getMemberEmailMap } from "../../../../lib/env";
import { listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";

export async function GET(request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email)return NextResponse.json({error:"Unauthorized"},{status:401});const requested=new URL(request.url).searchParams.get('member');const ownName=Object.entries(getMemberEmailMap()).find(([,email])=>email.toLowerCase()===session.user!.email!.toLowerCase())?.[0];const member=session.user.isAdmin?requested??undefined:ownName;if(!session.user.isAdmin&&!member)return NextResponse.json({error:"Member identity is not configured"},{status:403});return NextResponse.json(await listMonthlyKpiAudit(params.month,member));}
