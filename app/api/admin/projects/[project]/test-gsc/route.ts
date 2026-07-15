import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../../lib/api/errors";
import { authOptions } from "../../../../../../lib/auth";
import { listSearchConsoleProperties } from "../../../../../../lib/google";
import { getUnifiedProjectConfig } from "../../../../../../lib/repositories/project-settings";

type Context = { params: Promise<{ project: string }> };
export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  if (!session.accessToken)
    return NextResponse.json(
      {
        ok: false,
        error: "Google access token is missing.",
        code: "google_token_missing",
        requestId,
      },
      { status: 401 },
    );
  try {
    const { project } = await context.params;
    const config = await getUnifiedProjectConfig(decodeURIComponent(project));
    const properties = await listSearchConsoleProperties(session.accessToken);
    const expected =
      config.project?.gsc_property ?? config.option.approvedGscProperty;
    const match = properties.find((row) => row.siteUrl === expected) ?? null;
    return apiOk(
      {
        project: config.option.project,
        expectedProperty: expected,
        accessible: Boolean(match),
        property: match,
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "GSC access check failed");
  }
}
