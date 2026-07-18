import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { apiErrorResponse, apiOk, requestIdFor } from "../../../../lib/api/errors";
import { assertUnifiedWriteEnvironment } from "../../../../lib/env";
import { assertUnifiedSchemaReady } from "../../../../lib/schema-readiness";
import { createRuleVersion, getRuleRegistry } from "../../../../lib/services/rule-service";

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) return NextResponse.json({ ok: false, code: "forbidden", message: "Forbidden", requestId }, { status: 403 });
  try { return apiOk({ registry: await getRuleRegistry() }, requestId); }
  catch (error) { return apiErrorResponse(error, requestId, "Rule registry load failed", 500); }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) return NextResponse.json({ ok: false, code: "forbidden", message: "Forbidden", requestId }, { status: 403 });
  try {
    assertUnifiedWriteEnvironment();
    await assertUnifiedSchemaReady();
    return apiOk({ version: await createRuleVersion(await request.json(), session.user.email) }, requestId, { status: 201 });
  } catch (error) { return apiErrorResponse(error, requestId, "Rule version save failed"); }
}
