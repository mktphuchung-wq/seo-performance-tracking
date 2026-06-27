import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { processRefreshBatch } from "../../../../lib/refresh";

export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });

    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!session.accessToken) return NextResponse.json({ ok: false, code: "GSC_AUTH_MISSING", message: "Google Search Console authorization is missing. Sign out and sign in again with Google." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!jobId) return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });

    const result = await processRefreshBatch(session.accessToken, Number(body.limit || 25), jobId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected refresh process error";
    const isAuthError = /auth|credential|token|unauthorized|forbidden/i.test(message);
    return NextResponse.json(isAuthError ? { ok: false, code: "GSC_AUTH_FAILED", message } : { ok: false, error: message }, { status: isAuthError ? 401 : 500 });
  }
}
