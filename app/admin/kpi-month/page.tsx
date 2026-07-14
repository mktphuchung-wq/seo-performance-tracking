import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { MonthPicker } from "../../../components/kpi-month/MonthPicker";
import { PageContainer, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { appConfig } from "../../../lib/env";

export const dynamic = "force-dynamic";

export default async function KpiMonthIndex() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const month = new Date().toISOString().slice(0, 7);
  return <Shell email={session.user.email} isAdmin>
    <PageContainer className="px-0">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Monthly KPI Engine v2</p>
          <h2 className="mt-2 text-3xl font-bold">Auditable shadow payroll workspace</h2>
          <p className="mt-3 max-w-3xl text-slate-600">Work is reconciled by source item, calculated once at Member × Month across every project, and retained with URL, rule, review, measurement-window and approval evidence. Missing evidence remains N/A.</p>
          <div className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${appConfig.kpiEngineV2Enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {appConfig.kpiEngineV2Enabled ? "Staging shadow writes enabled" : "Read-only: feature flag off"}
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Open a payroll month</h3>
          <MonthPicker defaultMonth={month} />
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link className="font-semibold text-blue-700" href={`/admin/kpi-month/${month}`}>Open current month</Link>
            <Link className="font-semibold text-blue-700" href="/admin/monthly-kpi-settings">Configure project lifecycle and Performance</Link>
          </div>
        </section>
      </div>
    </PageContainer>
  </Shell>;
}
