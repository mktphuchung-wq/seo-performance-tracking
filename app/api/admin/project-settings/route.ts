import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../lib/env";
import { listUnifiedProjectSettings,saveMemberProjectContributionWeights,saveUnifiedProjectSettings } from "../../../../lib/repositories/project-settings";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json(await listUnifiedProjectSettings());}
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertUnifiedWriteEnvironment();const body=await request.json();const actor=session.user.email;if(body.action==="contribution_weights")return NextResponse.json(await saveMemberProjectContributionWeights({...body,actor}));return NextResponse.json(await saveUnifiedProjectSettings({...body,actor}));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Project Settings save failed"},{status:400});}}
