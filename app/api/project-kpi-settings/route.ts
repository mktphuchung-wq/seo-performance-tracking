import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { getProjectKpiSettings, isProjectKpiSettingsMissingError, parseProjectKpiForm, PROJECT_KPI_SETTINGS_MISSING_MESSAGE, upsertProjectKpiSettings } from "../../../lib/project-kpi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ settings: await getProjectKpiSettings() });
  } catch (error) {
    if (isProjectKpiSettingsMissingError(error)) return NextResponse.json({ error: PROJECT_KPI_SETTINGS_MISSING_MESSAGE }, { status: 503 });
    return NextResponse.json({ error: "Failed to load Project KPI Settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  try {
    const input = contentType.includes("application/json") ? await request.json() : parseProjectKpiForm(await request.formData());
    const saved = await upsertProjectKpiSettings(input);
    if (contentType.includes("application/json")) return NextResponse.json({ setting: saved });
    return NextResponse.redirect(new URL(`/admin/project-kpi-settings?project=${encodeURIComponent(saved.project)}`, request.url));
  } catch (error) {
    const message = isProjectKpiSettingsMissingError(error) ? PROJECT_KPI_SETTINGS_MISSING_MESSAGE : error instanceof Error ? error.message : "Failed to save Project KPI Settings.";
    return NextResponse.json({ error: message }, { status: isProjectKpiSettingsMissingError(error) ? 503 : 500 });
  }
}
