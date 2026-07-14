import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { assertKpiV2WriteEnvironment } from "../../../../lib/env";
import { apiErrorResponse, apiSuccess, createRequestId, KpiApiError, readJsonObject } from "../../../../lib/kpi/api-contract";
import { listProjectKpiV2Settings, saveProjectKpiV2Settings } from "../../../../lib/repositories/project-kpi-v2-settings";

export async function GET() {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    return apiSuccess({ settings: await listProjectKpiV2Settings() }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Settings read failed"); }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.isAdmin) throw new KpiApiError("FORBIDDEN", "Admin access is required.", 403);
    assertKpiV2WriteEnvironment();
    const body = await readJsonObject(request);
    return apiSuccess({ setting: (await saveProjectKpiV2Settings(body)).rows[0] }, requestId);
  } catch (error) { return apiErrorResponse(error, requestId, "Settings save failed"); }
}
