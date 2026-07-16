import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { getProjectKpiSettings, getProjectKpiSettingsDiagnosticMessage, isProjectKpiSettingsColumnMissingError, isProjectKpiSettingsMissingError, parseProjectKpiForm, upsertProjectKpiSettings } from "../../../lib/project-kpi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ settings: await getProjectKpiSettings() });
  } catch (error) {
    if (isProjectKpiSettingsMissingError(error) || isProjectKpiSettingsColumnMissingError(error)) return NextResponse.json({ error: await getProjectKpiSettingsDiagnosticMessage(error) }, { status: 503 });
    return NextResponse.json({ error: await getProjectKpiSettingsDiagnosticMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return NextResponse.json({error:"Legacy Project KPI Settings is read-only. Use POST /api/admin/project-settings."},{status:410});
}
