import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { isProjectKpiSettingsMissingError, parseProjectKpiForm, PROJECT_KPI_SETTINGS_MISSING_MESSAGE, upsertProjectKpiSettings } from "../../../../lib/project-kpi";

export async function PATCH(request: Request, { params }: { params: { project: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const input = (request.headers.get("content-type") || "").includes("application/json") ? await request.json() : parseProjectKpiForm(await request.formData(), decodeURIComponent(params.project));
    return NextResponse.json({ setting: await upsertProjectKpiSettings({ ...input, project: decodeURIComponent(params.project) }) });
  } catch (error) {
    const message = isProjectKpiSettingsMissingError(error) ? PROJECT_KPI_SETTINGS_MISSING_MESSAGE : error instanceof Error ? error.message : "Failed to save Project KPI Settings.";
    return NextResponse.json({ error: message }, { status: isProjectKpiSettingsMissingError(error) ? 503 : 500 });
  }
}
