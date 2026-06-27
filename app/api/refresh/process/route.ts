import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { processRefreshBatch } from "../../../../lib/refresh";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken || !session.user.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(await processRefreshBatch(session.accessToken, Number(body.limit || 25), body.jobId));
}
