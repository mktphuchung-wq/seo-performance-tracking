import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { KpiLoadError } from "../../../components/kpi-month/KpiLoadError";
import { ProjectSettingsPanel } from "../../../components/kpi-month/ProjectSettingsPanel";
import { PageContainer, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { appConfig } from "../../../lib/env";
import { listProjectKpiV2Settings } from "../../../lib/repositories/project-kpi-v2-settings";

export const dynamic = "force-dynamic";

export default async function MonthlyKpiSettings() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  try {
    const settings = await listProjectKpiV2Settings();
    return <Shell email={session.user.email} isAdmin><PageContainer className="px-0"><div className="space-y-6">
      <header><p className="text-sm font-semibold uppercase text-blue-700">Điều khiển KPI v2 trên staging</p><h2 className="text-3xl font-bold">Vòng đời dự án và cài đặt Performance</h2><p className="mt-2 text-slate-600">Performance giữ trạng thái N/A cho đến khi dự án được bật rõ ràng và có nhóm đo lường đủ trưởng thành, đáng tin cậy. Lỗi phân quyền hoặc ánh xạ là lỗi hệ thống, tuyệt đối không được ghi thành 0.</p></header>
      <ProjectSettingsPanel initialSettings={settings} featureEnabled={appConfig.kpiEngineV2Enabled} />
    </div></PageContainer></Shell>;
  } catch (error) {
    const requestId = randomUUID();
    console.error("monthly_kpi_settings_load_failed", { requestId, error });
    return <Shell email={session.user.email} isAdmin><PageContainer className="px-0"><KpiLoadError requestId={requestId} message={error instanceof Error ? error.message : String(error)} /></PageContainer></Shell>;
  }
}
