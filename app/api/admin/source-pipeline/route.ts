import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { commitSourcePipeline,previewSourcePipeline } from "../../../../lib/services/source-pipeline";

export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});if(!session.accessToken)return NextResponse.json({error:"Google access token is missing."},{status:401});try{const body=await request.json().catch(()=>({}));const input={accessToken:session.accessToken,actor:session.user.email};if(body.action==="commit")return NextResponse.json(await commitSourcePipeline({...input,approvalReason:String(body.approvalReason??"")}));return NextResponse.json(await previewSourcePipeline(input));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Source pipeline failed"},{status:400});}}
