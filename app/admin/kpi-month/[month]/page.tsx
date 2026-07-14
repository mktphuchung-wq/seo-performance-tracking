import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { KpiLoadError } from "../../../../components/kpi-month/KpiLoadError";
import { KpiMonthWorkspace } from "../../../../components/kpi-month/KpiMonthWorkspace";
import { PageContainer, Shell } from "../../../../components/ui";
import { authOptions } from "../../../../lib/auth";
import { appConfig } from "../../../../lib/env";
import { parseMonth } from "../../../../lib/kpi/api-contract";
import { isKpiE2eFixtureMode, kpiE2eFixtureAudit, kpiE2eFixturePreview } from "../../../../lib/kpi/e2e-fixture";
import { calculateMemberFinal, listMonthlyKpiAudit } from "../../../../lib/repositories/monthly-kpi";

export const dynamic = "force-dynamic";

export default async function KpiMonthPage({ params, searchParams }: { params: { month: string }; searchParams?: { member?: string; locked?: string } }) {
  if (isKpiE2eFixtureMode()) {
    const month = parseMonth(params.month);
    const memberName = searchParams?.member?.trim() || "Hướng Dương";
    const audit = kpiE2eFixtureAudit(month, searchParams?.locked === "1");
    return <Shell email="admin.fixture@example.test" isAdmin><PageContainer className="px-0"><header className="mb-6"><p className="text-sm font-semibold uppercase text-blue-700">Fixture E2E cục bộ · chỉ shadow</p><h2 className="text-3xl font-bold">KPI tháng {month}</h2></header><KpiMonthWorkspace month={month} memberName={memberName} initialAudit={audit} initialPreview={kpiE2eFixturePreview} featureEnabled /></PageContainer></Shell>;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  let month: string;
  try { month = parseMonth(params.month); } catch { redirect("/admin/kpi-month"); }
  const requestedMember = searchParams?.member?.trim() || undefined;
  try {
    const allAudit = await listMonthlyKpiAudit(month);
    const memberName = requestedMember ?? allAudit.members?.[0]?.member_name;
    const audit = memberName ? await listMonthlyKpiAudit(month, memberName) : allAudit;
    audit.members = allAudit.members;
    audit.reconciliation = allAudit.reconciliation;
    let preview = null;
    if (memberName) {
      try { preview = await calculateMemberFinal({ month, memberName }); }
      catch (error) {
        if (!/component_missing|component definition/i.test(error instanceof Error ? error.message : String(error))) throw error;
      }
    }
    return <Shell email={session.user.email} isAdmin>
      <PageContainer className="px-0">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase text-blue-700">Chỉ dành cho staging / shadow payroll</p>
          <h2 className="text-3xl font-bold">KPI month {month}</h2>
          <p className="mt-2 text-slate-600">Chạy quy trình từ đối soát đến bằng chứng audit. Snapshot đã hoàn tất vẫn chỉ là shadow cho đến khi PM và Finance phê duyệt production payroll riêng.</p>
        </header>
        <KpiMonthWorkspace month={month} memberName={memberName} initialAudit={audit} initialPreview={preview} featureEnabled={appConfig.kpiEngineV2Enabled} />
      </PageContainer>
    </Shell>;
  } catch (error) {
    const requestId = randomUUID();
    console.error("monthly_kpi_page_load_failed", { requestId, month, error });
    return <Shell email={session.user.email} isAdmin><PageContainer className="px-0"><KpiLoadError requestId={requestId} message={error instanceof Error ? error.message : String(error)} /></PageContainer></Shell>;
  }
}
