import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { resolveMemberNameByEmail } from "../../../../lib/member-identity";
import { listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";

export async function GET(request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email)return NextResponse.json({error:"Unauthorized"},{status:401});const requested=new URL(request.url).searchParams.get('member');const ownName=await resolveMemberNameByEmail(session.user.email);const member=session.user.isAdmin?requested??undefined:ownName??undefined;if(!session.user.isAdmin&&!member)return NextResponse.json({error:"Member identity is not configured"},{status:403});return NextResponse.json(await listMonthlyKpiAudit(params.month,member));
}
