import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { listMonthlyKpiAudit } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});const memberName=new URL(request.url).searchParams.get('member')??undefined;return NextResponse.json(await listMonthlyKpiAudit(params.month,memberName));}
