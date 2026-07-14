import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { reopenLockedMemberMonth } from "../../../../../../lib/repositories/month-lock";

export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();const body=await request.json();return NextResponse.json(await reopenLockedMemberMonth({resultId:body.resultId,reason:body.reason,actor:session.user.email}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Reopen failed"},{status:400});}}
