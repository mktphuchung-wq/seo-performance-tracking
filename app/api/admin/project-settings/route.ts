import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../lib/env";
import { listUnifiedProjectSettings,saveUnifiedProjectSettings } from "../../../../lib/repositories/project-settings";
import { apiErrorResponse,apiOk,requestIdFor } from "../../../../lib/api/errors";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json(await listUnifiedProjectSettings());}
export async function POST(request:Request){const requestId=requestIdFor(request);const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({ok:false,error:"Forbidden",code:"forbidden",requestId},{status:403});try{assertUnifiedWriteEnvironment();const body=await request.json();return apiOk({settings:await saveUnifiedProjectSettings({...body,actor:session.user.email})},requestId);}catch(error){return apiErrorResponse(error,requestId,"Project Settings save failed");}}
