import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { listMonthlyKpiAudit,saveManualComponent } from "../../../../../../lib/repositories/monthly-kpi";

export async function GET(_request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({components:(await listMonthlyKpiAudit(params.month)).components});
}
export async function POST(request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();return NextResponse.json(await saveManualComponent({...(await request.json()),month:params.month,actor:session.user.email}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Component save failed"},{status:400});}
}
