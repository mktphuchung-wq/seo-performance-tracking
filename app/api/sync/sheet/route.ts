import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { classifyGoogleApiError } from "../../../../lib/google";
import { syncSheetToDb } from "../../../../lib/refresh";

function googleErrorResponse(error: unknown) {
  const classified = classifyGoogleApiError(error);
  if (classified === "invalid_credentials") {
    return NextResponse.json({
      ok: false,
      error: "Google credentials are invalid or expired. Please sign out and sign in again.",
      code: "GOOGLE_INVALID_CREDENTIALS"
    }, { status: 401 });
  }
  if (classified === "permission_denied") {
    return NextResponse.json({
      ok: false,
      error: "Google account does not have permission to read this Sheet or required scope is missing.",
      code: "GOOGLE_PERMISSION_DENIED"
    }, { status: 403 });
  }
  return null;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!session.accessToken) {
    return NextResponse.json({
      ok: false,
      error: "Google access token is missing. Please sign out and sign in again."
    }, { status: 401 });
  }

  try {
    const result = await syncSheetToDb(session.accessToken);
    return NextResponse.json({ ok: result.status === "success", ...result }, { status: result.status === "success" ? 200 : 500 });
  } catch (error) {
    const googleResponse = googleErrorResponse(error);
    if (googleResponse) return googleResponse;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Google Sheet sync failed" }, { status: 500 });
  }
}
