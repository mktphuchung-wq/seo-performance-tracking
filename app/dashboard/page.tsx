import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { resolveMemberNameByEmail } from "../../lib/member-identity";
import { getPerformanceWorkspace } from "../../lib/services/performance-service";
import { listMemberUrlWorkspace } from "../../lib/repositories/data-source";
import { listMonthlyKpiAudit } from "../../lib/repositories/monthly-kpi";
import { viLabel, viReason } from "../../lib/i18n/vi";
export const dynamic = "force-dynamic";
const pct = (v: any) =>
  v === null || v === undefined ? "N/A" : `${Number(v).toFixed(1)}%`;
export default async function MyPerformance(props: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (session.user.isAdmin) redirect("/admin/sync");
  const memberName = await resolveMemberNameByEmail(session.user.email);
  if (!memberName) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const [data, urls, kpi] = await Promise.all([
    getPerformanceWorkspace({ asOfMonth: month, memberName }),
    listMemberUrlWorkspace({ memberName, month, pageSize: 1 }),
    listMonthlyKpiAudit(month, memberName),
  ]);
  const summary = data.summaries[0];
  const finalKpi = kpi.results[0];
  return (
    <Shell email={session.user.email}>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Không gian thành viên
          </p>
          <h2 className="text-3xl font-bold">Hiệu suất của tôi</h2>
          <p className="mt-2 text-slate-600">
            Tháng hiện tại là chẩn đoán riêng, không tự động thay đổi Final KPI; 3 tháng,
            6 tháng và toàn thời gian giữ nguyên công thức đã duyệt.
          </p>
        </header>
        <form className="flex items-end gap-3" method="get"><label className="text-sm">Tháng<input className="mt-1 block rounded-lg border px-3 py-2" name="month" type="month" defaultValue={month}/></label><button className="rounded-lg border px-4 py-2 font-semibold">Xem</button></form>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="URL / work units" value={`${urls.total} / ${urls.summary.workUnits.toLocaleString("vi-VN")}`} />
          <MetricCard label="Quality đã duyệt / chờ" value={`${urls.summary.approvedReviews} / ${urls.summary.pendingReviews}`} />
          <MetricCard
            label="Hiệu suất thành viên"
            value={pct(summary?.memberResult.score)}
          />
          <MetricCard
            label="Final KPI / trạng thái"
            value={`${pct(finalKpi?.payable_pct)} · ${viLabel(finalKpi?.status ?? "draft")}`}
          />
        </div>
        <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">Độ phủ Performance {pct(summary?.memberResult.coveragePct)} · {viReason(summary?.memberResult.reason ?? "performance_not_refreshed")} · KPI {finalKpi?.locked_at ? `đã khóa, version ${finalKpi.version}` : "đang draft/chưa khóa"}. N/A không được quy đổi thành 0.</p>
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Dự án</th>
                <th>Tháng hiện tại</th>
                <th>3M</th>
                <th>6M</th>
                <th>Toàn thời gian</th>
                <th>Điểm dự án</th>
                <th>Độ phủ</th>
                <th>Vòng đời</th>
              </tr>
            </thead>
            <tbody>
              {summary?.projects.map((project: any) => (
                <tr className="border-t" key={project.project}>
                  <td className="p-3">{project.project}</td>
                  <td>{pct(project.currentMonth?.payable_pct)}</td>
                  {["3m", "6m", "all_time"].map((key) => (
                    <td key={key}>
                      {pct(
                        project.ranges.find((r: any) => r.range_key === key)
                          ?.payable_pct,
                      )}
                    </td>
                  ))}
                  <td>{pct(project.result.score)}</td>
                  <td>{pct(project.result.coveragePct)}</td>
                  <td>{project.lifecycle ?? "—"}</td>
                </tr>
              ))}
              {!summary && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={8}>
                    Chưa có kết quả Hiệu suất chuẩn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
