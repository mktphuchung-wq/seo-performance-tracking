import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getProjectKpiSettingsDiagnosticMessage, isProjectKpiSettingsColumnMissingError, isProjectKpiSettingsMissingError, parseProjectKpiForm, upsertProjectKpiSettings } from "../../../../lib/project-kpi";

export async function PATCH(request: Request, { params }: { params: { project: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const input = (request.headers.get("content-type") || "").includes("application/json") ? await request.json() : parseProjectKpiForm(await request.formData(), decodeURIComponent(params.project));
    return NextResponse.json({ setting: await upsertProjectKpiSettings({ ...input, project: decodeURIComponent(params.project) }) });
  } catch (error) {
    const isSchemaError = isProjectKpiSettingsMissingError(error) || isProjectKpiSettingsColumnMissingError(error);
    const message = isSchemaError ? await getProjectKpiSettingsDiagnosticMessage(error) : error instanceof Error ? error.message : "Failed to save Project KPI Settings.";
    return NextResponse.json({ error: message }, { status: isSchemaError ? 503 : 500 });
  }
}
