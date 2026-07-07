import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDateRange } from "../../../../lib/dates";
import { getDbPerformance } from "../../../../lib/postgres";
import { adjustedProjectFromRows, getProjectKpiSettings, isProjectKpiSettingsMissingError, PROJECT_KPI_SETTINGS_MISSING_MESSAGE } from "../../../../lib/project-kpi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await getDbPerformance("current_month", getDateRange({ range: "current_month" }));
    const settings = new Map((await getProjectKpiSettings()).map((s) => [s.project, s]));
    const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => { (acc[row.project] ??= []).push(row); return acc; }, {});
    return NextResponse.json({ projects: Object.entries(grouped).map(([project, list]) => adjustedProjectFromRows(project, list, settings.get(project))) });
  } catch (error) {
    const message = isProjectKpiSettingsMissingError(error) ? PROJECT_KPI_SETTINGS_MISSING_MESSAGE : "Failed to load adjusted project performance.";
    return NextResponse.json({ error: message }, { status: isProjectKpiSettingsMissingError(error) ? 503 : 500 });
  }
}
