import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../../../lib/env";
import { listQualityReviewQueue,saveQualityReview } from "../../../../../../lib/repositories/quality-reviews";

export async function GET(_request:Request,{params}:{params:{month:string}}){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({reviews:await listQualityReviewQueue(/^\d{4}-\d{2}$/.test(params.month)?`${params.month}-01`:params.month)});}
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user?.email||!session.user.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});try{assertKpiV2WriteEnvironment();const body=await request.json();const reviews=Array.isArray(body.reviews)?body.reviews:[body];const saved=[];for(const review of reviews)saved.push(await saveQualityReview({...review,reviewer:session.user.email}));return NextResponse.json({reviews:saved});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Review save failed"},{status:400});}}
