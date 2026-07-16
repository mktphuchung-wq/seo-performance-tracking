import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../../lib/api/errors";
import { authOptions } from "../../../../../../lib/auth";
import { assertUnifiedWriteEnvironment } from "../../../../../../lib/env";
import {
  getUnifiedProjectConfig,
  saveUnifiedProjectSettings,
} from "../../../../../../lib/repositories/project-settings";

type Context = { params: Promise<{ project: string }> };
export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    const { project } = await context.params;
    return apiOk(
      await getUnifiedProjectConfig(decodeURIComponent(project)),
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      requestId,
      "Project configuration load failed",
      404,
    );
  }
}
export async function PUT(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Forbidden", code: "forbidden", requestId },
      { status: 403 },
    );
  try {
    assertUnifiedWriteEnvironment();
    const [{ project }, body] = await Promise.all([
      context.params,
      request.json(),
    ]);
    const projectName = decodeURIComponent(project);
    return apiOk(
      {
        config: await saveUnifiedProjectSettings({
          ...body,
          projectName,
          actor: session.user.email,
        }),
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      requestId,
      "Project configuration save failed",
    );
  }
}
