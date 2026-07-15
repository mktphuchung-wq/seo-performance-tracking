import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { listMonthlyKpiAudit, upsertMonthlyTarget } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(_request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({targets:(await listMonthlyKpiAudit(params.month)).targets});
}
export async function POST(request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();const body=await request.json();return NextResponse.json({target:(await upsertMonthlyTarget({...body,month:params.month})).rows[0]});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Target save failed"},{status:400});}
}
