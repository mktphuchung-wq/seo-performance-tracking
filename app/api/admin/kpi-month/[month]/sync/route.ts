import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { syncKpiV2WorkSource } from "../../../../../../lib/sync/kpi-v2";

export async function POST(request:Request, props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  const session=await getServerSession(authOptions);
  if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});
  if(!session.accessToken)return NextResponse.json({error:"Google access token is missing."},{status:401});
  try{const query=new URL(request.url).searchParams;const dryRun=query.get("dryRun")!=="false";const stage=query.get("stage")==="events"?"events":"raw";const approvalReason=query.get("approvalReason");return NextResponse.json({month:params.month,stage,...(await syncKpiV2WorkSource({accessToken:session.accessToken,actor:session.user.email,dryRun,persistEvents:stage==="events",approvalReason}))});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"KPI source sync failed"},{status:500});}
}
