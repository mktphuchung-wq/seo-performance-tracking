import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { resolveMemberNameByEmail } from "../../lib/member-identity";
import { listMonthlyKpiAudit } from "../../lib/repositories/monthly-kpi";
import { formatViDateTime, viLabel, viReason } from "../../lib/i18n/vi";

export const dynamic = "force-dynamic";
const pct = (value: unknown) => value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)}%`;

export default async function MyKpi(props: { searchParams?: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (session.user.isAdmin) redirect("/admin/kpi-close");
  const memberName = await resolveMemberNameByEmail(session.user.email);
  if (!memberName) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const audit = await listMonthlyKpiAudit(month, memberName);
  const final = audit.results[0];
  const config = audit.configs[0];
  const weights = Object.fromEntries((config?.config_components ?? []).map((row: any) => [row.componentKey, Number(row.weightPct)]));
  return (
    <Shell email={session.user.email}>
      <div className="space-y-6">
        <header><p className="text-sm font-semibold uppercase text-blue-700">Không gian thành viên</p><h2 className="text-3xl font-bold">KPI của tôi — {month}</h2><p className="mt-2 text-slate-600">Chi tiết từng thành phần và snapshot KPI cuối cùng bất biến. N/A không bao giờ hiển thị thành 0.</p></header>
        <div className="grid gap-4 md:grid-cols-3"><MetricCard label="KPI cuối cùng" value={pct(final?.payable_pct)} /><MetricCard label="Độ phủ" value={pct(final?.coverage_pct)} /><MetricCard label="Trạng thái" value={viLabel(final?.status ?? "draft")} /></div>
        <section className="rounded-2xl border bg-white p-4 text-sm text-slate-600"><strong className="text-slate-900">Lineage snapshot</strong><p className="mt-2">KPI version {final?.version ?? "N/A"} · rule {final?.rule_version ?? "N/A"} · tạo {final?.calculated_at ? formatViDateTime(final.calculated_at) : "N/A"} · khóa {final?.locked_at ? formatViDateTime(final.locked_at) : "chưa khóa"}{final?.reopened_from_id ? ` · mở lại từ snapshot ${final.reopened_from_id}` : ""}.</p></section>
        <DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Dự án</th><th>Quantity thô / cap</th><th>Quality thô / cap</th><th>SEO Performance</th><th>Độ phủ Performance</th><th>Confidence</th></tr></thead><tbody>{audit.projectResults.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3 font-semibold">{row.project}</td><td>{pct(row.quantity_raw_pct)} / {pct(row.quantity_payable_pct)}</td><td>{pct(row.quality_raw_pct)} / {pct(row.quality_payable_pct)}</td><td>{pct(row.performance_payable_pct)}</td><td>{pct(row.performance_coverage_pct)}</td><td>{viLabel(row.confidence)}</td></tr>)}{!audit.projectResults.length && <tr><td className="p-4 text-slate-500" colSpan={6}>Chưa có breakdown dự án cho tháng này.</td></tr>}</tbody></table></DataTableContainer>
        <DataTableContainer>
          <table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Thành phần</th><th>Điểm thô</th><th>Điểm chi trả/cap</th><th>Trọng số</th><th>Độ phủ</th><th>Trạng thái</th><th>Lý do</th><th>Quy tắc</th></tr></thead><tbody>{audit.components.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3">{viLabel(row.component_key)}</td><td>{pct(row.raw_pct)}</td><td>{row.is_not_applicable ? "N/A" : pct(row.payable_pct)}</td><td>{weights[row.component_key] === undefined ? "N/A" : pct(weights[row.component_key])}</td><td>{pct(row.coverage_pct)}</td><td>{viLabel(row.status)}</td><td>{viReason(row.na_reason ?? row.reason ?? row.override_reason ?? "—")}</td><td>{row.rule_version}</td></tr>)}</tbody></table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
