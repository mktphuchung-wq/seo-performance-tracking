import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { listMonthlyKpiAudit } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});const memberName=new URL(request.url).searchParams.get('member')??undefined;return NextResponse.json(await listMonthlyKpiAudit(params.month,memberName));
}
