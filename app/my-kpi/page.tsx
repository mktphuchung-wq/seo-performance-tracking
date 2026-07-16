import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { resolveMemberNameByEmail } from "../../lib/member-identity";
import { listMonthlyKpiAudit } from "../../lib/repositories/monthly-kpi";
import { viLabel, viReason } from "../../lib/i18n/vi";

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
  return (
    <Shell email={session.user.email}>
      <div className="space-y-6">
        <header><p className="text-sm font-semibold uppercase text-blue-700">Không gian thành viên</p><h2 className="text-3xl font-bold">KPI của tôi — {month}</h2><p className="mt-2 text-slate-600">Chi tiết từng thành phần và snapshot KPI cuối cùng bất biến. N/A không bao giờ hiển thị thành 0.</p></header>
        <div className="grid gap-4 md:grid-cols-3"><MetricCard label="KPI cuối cùng" value={pct(final?.payable_pct)} /><MetricCard label="Độ phủ" value={pct(final?.coverage_pct)} /><MetricCard label="Trạng thái" value={viLabel(final?.status ?? "draft")} /></div>
        <DataTableContainer>
          <table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Thành phần</th><th>Điểm thô</th><th>Điểm chi trả</th><th>Độ phủ</th><th>Trạng thái</th><th>Lý do</th><th>Quy tắc</th></tr></thead><tbody>{audit.components.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3">{viLabel(row.component_key)}</td><td>{pct(row.raw_pct)}</td><td>{row.is_not_applicable ? "N/A" : pct(row.payable_pct)}</td><td>{pct(row.coverage_pct)}</td><td>{viLabel(row.status)}</td><td>{viReason(row.na_reason ?? row.reason ?? row.override_reason ?? "—")}</td><td>{row.rule_version}</td></tr>)}</tbody></table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
