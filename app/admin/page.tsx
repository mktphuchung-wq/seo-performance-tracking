import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { authOptions } from "../../lib/auth";
import { formatViDateTime, viLabel, viReason } from "../../lib/i18n/vi";
import { getAdminOverview } from "../../lib/services/admin-overview-service";

export const dynamic = "force-dynamic";
const pct = (value: unknown) => value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)}%`;
const count = (value: unknown) => Number(value ?? 0).toLocaleString("vi-VN");

export default async function AdminOverviewPage(props: {
  searchParams?: Promise<{ month?: string; project?: string; member?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const searchParams = await props.searchParams;
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const project = searchParams?.project || undefined;
  const member = searchParams?.member || undefined;
  const data = await getAdminOverview({ month, project, member });
  const reportParams = new URLSearchParams({ month });
  if (project) reportParams.set("project", project);
  if (member) reportParams.set("member", member);
  const warningLabels: Record<string, string> = {
    gsc_fetch_error: "GSC lỗi fetch — cần retry hoặc kiểm tra quyền",
    gsc_missing: "Chưa quan sát GSC — kiểm tra nguồn dữ liệu",
    performance_review: "URL mới/provisional — cần review, chưa được tính 0",
    quality_pending: "Quality review đang chờ duyệt",
  };
  return <Shell email={session.user.email} isAdmin>
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-semibold uppercase text-blue-700">Tổng quan quản trị</p><h2 className="text-3xl font-bold">KPI SEO — {month}</h2><p className="mt-2 text-slate-600">Từ dữ liệu nguồn đến KPI đã khóa, với freshness, độ phủ và cảnh báo có thể truy vết.</p></div>
        <a className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white" href={`/api/admin/reports/monthly?${reportParams}`}>Xuất báo cáo HTML</a>
      </header>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4" method="get">
        <label className="text-sm">Tháng<input className="mt-1 block rounded-lg border px-3 py-2" type="month" name="month" defaultValue={month} /></label>
        <label className="text-sm">Dự án<select className="mt-1 block min-w-48 rounded-lg border px-3 py-2" name="project" defaultValue={project ?? ""}><option value="">Tất cả</option>{data.filters.options.projects.map((value: string) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm">Thành viên<select className="mt-1 block min-w-48 rounded-lg border px-3 py-2" name="member" defaultValue={member ?? ""}><option value="">Tất cả</option>{data.filters.options.members.map((value: string) => <option key={value}>{value}</option>)}</select></label>
        <button className="rounded-lg border px-4 py-2 font-semibold">Áp dụng</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="URL chuẩn" value={count(data.summary.urlCount)} />
        <MetricCard label="Work units chi trả" value={count(data.summary.payableWorkUnits)} />
        <MetricCard label="Review đã duyệt / chờ" value={`${count(data.summary.approvedReviews)} / ${count(data.summary.pendingReviews)}`} />
        <MetricCard label="Dữ liệu GSC đến" value={data.dataThrough ?? "N/A"} tone={data.dataThrough ? "growth-neutral" : "kpi-null"} />
      </div>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">Cảnh báo cần xử lý</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{data.warnings.map((warning: any) => <Link className="rounded-xl border border-amber-200 bg-white p-3 text-sm hover:border-amber-400" href={warning.href} key={warning.code}><strong>{warning.count}</strong> · {warningLabels[warning.code] ?? warning.code}</Link>)}{!data.warnings.length && <p className="text-sm text-amber-800">Không có cảnh báo trong bộ lọc hiện tại.</p>}</div>
      </section>
      <section className="space-y-3"><h3 className="text-xl font-semibold">Theo thành viên</h3><DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Thành viên</th><th>URL</th><th>Work units</th><th>Review</th><th>Performance tháng</th><th>Độ phủ</th><th>KPI</th><th>Trạng thái</th><th>Drill-down</th></tr></thead><tbody>{data.members.map((row: any) => <tr className="border-t" key={row.member_name}><td className="p-3 font-semibold">{row.member_name}</td><td>{count(row.url_count)}</td><td>{count(row.work_units)}</td><td>{row.approved_reviews}/{row.pending_reviews}</td><td>{pct(row.performance_pct)}</td><td>{pct(row.performance_coverage)}</td><td>{pct(row.kpi_payable_pct)}</td><td>{viLabel(row.kpi_status ?? "draft")}</td><td><Link className="text-blue-700" href={`/admin/member-performance?month=${month}&member=${encodeURIComponent(row.member_name)}`}>Performance</Link> · <Link className="text-blue-700" href={`/admin/kpi-close?month=${month}&member=${encodeURIComponent(row.member_name)}`}>KPI</Link></td></tr>)}{!data.members.length && <tr><td className="p-4 text-slate-500" colSpan={9}>Không có dữ liệu trong bộ lọc.</td></tr>}</tbody></table></DataTableContainer></section>
      <section className="space-y-3"><h3 className="text-xl font-semibold">Theo dự án</h3><DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Dự án</th><th>URL</th><th>Work units</th><th>Performance tháng</th><th>Độ phủ</th><th>Confidence</th><th>Rule version</th><th>Lỗi / thiếu / zero</th></tr></thead><tbody>{data.projects.map((row: any) => <tr className="border-t" key={row.project}><td className="p-3 font-semibold">{row.project}</td><td>{count(row.url_count)}</td><td>{count(row.work_units)}</td><td>{pct(row.payable_pct)}</td><td>{pct(row.coverage_pct)}</td><td>{viLabel(row.confidence ?? "unknown")}</td><td>{row.rule_version ?? "N/A"}</td><td>{row.fetch_errors}/{row.missing_data}/{row.observed_zero}</td></tr>)}</tbody></table></DataTableContainer></section>
      <p className="text-xs text-slate-500">Tạo lúc {formatViDateTime(data.generatedAt)}. N/A giữ nguyên khi thiếu hoặc không đáng tin cậy; observed zero được hiển thị riêng và không bị trộn với lỗi fetch.</p>
    </div>
  </Shell>;
}
