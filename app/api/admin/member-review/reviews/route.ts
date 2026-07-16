import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../lib/api/errors";
import { authOptions } from "../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../lib/env";
import { saveQualityReview } from "../../../../../lib/repositories/quality-reviews";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    assertUnifiedWriteEnvironment();
    const body = await request.json();
    const reviews = Array.isArray(body.reviews) ? body.reviews : [body];
    const saved = [];
    for (const review of reviews)
      saved.push(
        await saveQualityReview({ ...review, reviewer: session.user.email }),
      );
    return apiOk({ reviews: saved }, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId, "Review save failed");
  }
}
