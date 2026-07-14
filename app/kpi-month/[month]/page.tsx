import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { KpiLoadError } from "../../../components/kpi-month/KpiLoadError";
import { MemberKpiView } from "../../../components/kpi-month/MemberKpiView";
import { PageContainer, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { getMemberEmailMap } from "../../../lib/env";
import { parseMonth } from "../../../lib/kpi/api-contract";
import { isKpiE2eFixtureMode, kpiE2eFixtureAudit } from "../../../lib/kpi/e2e-fixture";
import { listMonthlyKpiAudit } from "../../../lib/repositories/monthly-kpi";

export const dynamic = "force-dynamic";

export default async function MemberKpiMonthPage({ params }: { params: { month: string } }) {
  if (isKpiE2eFixtureMode()) {
    const month = parseMonth(params.month);
    return <Shell email="huong.fixture@example.test"><PageContainer className="px-0"><MemberKpiView month={month} memberName="Hướng Dương" audit={kpiE2eFixtureAudit(month, true)} /></PageContainer></Shell>;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  let month: string;
  try { month = parseMonth(params.month); } catch { redirect("/dashboard"); }
  const email = session.user.email.toLowerCase();
  const memberName = Object.entries(getMemberEmailMap()).find(([, configured]) => configured.toLowerCase() === email)?.[0];
  if (!memberName && session.user.isAdmin) redirect(`/admin/kpi-month/${month}`);
  if (!memberName) return <Shell email={session.user.email}><PageContainer className="px-0"><section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-6"><h2 className="text-xl font-bold">Chưa cấu hình danh tính thành viên</h2><p className="mt-2 text-sm">Hãy đề nghị quản trị viên ánh xạ email của bạn trong <code>MEMBER_EMAIL_MAP</code>. KPI của thành viên khác không bị hiển thị.</p></section></PageContainer></Shell>;
  try {
    const audit = await listMonthlyKpiAudit(month, memberName);
    return <Shell email={session.user.email}><PageContainer className="px-0"><MemberKpiView month={month} memberName={memberName} audit={audit} /></PageContainer></Shell>;
  } catch (error) {
    const requestId = randomUUID();
    console.error("member_kpi_page_load_failed", { requestId, month, memberName, error });
    return <Shell email={session.user.email}><PageContainer className="px-0"><KpiLoadError requestId={requestId} message={error instanceof Error ? error.message : String(error)} /></PageContainer></Shell>;
  }
}
