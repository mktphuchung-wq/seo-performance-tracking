import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDashboardMetricPeriods, getDateRange, normalizeDateRangeKey } from "../../../lib/dates";
import { getEnvErrors } from "../../../lib/env";
import { filterRowsForEmail } from "../../../lib/google";
import { getDbPerformance, getAllMemberPerformanceFinal, getMemberPerformanceFinalByMember } from "../../../lib/postgres";
import { aggregateCompared, type GrowthStatus } from "../../../lib/growth";
import { fmtGrowth, fmtNum, fmtPct, fmtPos, MetricSection, PerformanceKpiPanel, RefreshDataButton, SectionGrid, Shell, UrlTable, WarningList, type MetricTone, contentTypeLabel } from "../../../components/ui";
import { formatSignedNumber } from "../../../lib/format";
import { labelText, type OpportunityLabel } from "../../../lib/metrics";
import Link from "next/link";
import { uiLabel } from "../../../lib/ui-labels";

type SearchParams = {
  range?: string;
  startDate?: string;
  endDate?: string;
  sort?: import("../../../components/ui").UrlSortKey;
  direction?: import("../../../components/ui").UrlSortDirection;
  project?: string;
  member?: string;
  growthStatus?: GrowthStatus | "";
  opportunityStatus?: OpportunityLabel | "";
  searchUrl?: string;
  minImpressions?: string;
  minClicks?: string;
  contentType?: string;
  view?: PresetView;
};

type PresetView = "all" | "growing" | "declining" | "no_data" | "high_impressions_low_ctr" | "top_click_growth" | "top_impression_growth" | "needs_update";

const growthStatusOptions: GrowthStatus[] = ["growing", "new_signal", "declining", "stable", "no_data"];
const opportunityStatusOptions: OpportunityLabel[] = ["no_data", "ctr_opportunity", "ranking_opportunity", "winner", "low_visibility", "normal"];
const rangeOptions = [["current_month", "Tháng hiện tại"], ["previous_month", "Tháng trước"], ["last_3_months", "3 tháng gần nhất"], ["last_6_months", "6 tháng gần nhất"], ["all_time", "Toàn thời gian"], ["custom", "Tùy chỉnh"]] as const;
const presetViews: { key: PresetView; label: string; sort?: SearchParams["sort"]; direction?: SearchParams["direction"] }[] = [
  { key: "all", label: "Tất cả URL" },
  { key: "growing", label: "URL đang tăng trưởng", sort: "click_growth_pct", direction: "desc" },
  { key: "declining", label: "URL đang suy giảm", sort: "click_growth_pct", direction: "asc" },
  { key: "no_data", label: "URL chưa đủ dữ liệu", sort: "impressions", direction: "asc" },
  { key: "high_impressions_low_ctr", label: "Hiển thị cao, CTR thấp", sort: "impressions", direction: "desc" },
  { key: "top_click_growth", label: "Tăng trưởng lượt nhấp cao nhất", sort: "click_growth_pct", direction: "desc" },
  { key: "top_impression_growth", label: "Tăng trưởng hiển thị cao nhất", sort: "impression_growth_pct", direction: "desc" },
  { key: "needs_update", label: "Cần cập nhật", sort: "refreshed_at", direction: "asc" }
];

function uniqueValues<T extends Record<K, string>, K extends keyof T>(rows: T[], key: K) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function cleanParams(params: SearchParams, overrides: Partial<SearchParams> = {}) {
  const query = new URLSearchParams();
  Object.entries({ ...params, ...overrides }).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return `?${query.toString()}`;
}


function growthMetricTone(value: number | null): MetricTone {
  if (value === null || value === 0) return "growth-neutral";
  return value > 0 ? "growth-positive" : "growth-negative";
}

function filterPerformance(rows: Awaited<ReturnType<typeof getDbPerformance>>, params: SearchParams) {
  const minImpressions = Number(params.minImpressions || 0);
  const minClicks = Number(params.minClicks || 0);
  const search = params.searchUrl?.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (params.project && row.project !== params.project) return false;
    if (params.member && row.member_name !== params.member) return false;
    if (params.growthStatus && row.status !== params.growthStatus) return false;
    if (params.opportunityStatus && row.opportunity !== params.opportunityStatus) return false;
    if (params.contentType && (row.content_type || "") !== params.contentType) return false;
    if (search && !row.url.toLowerCase().includes(search)) return false;
    if (Number.isFinite(minImpressions) && minImpressions > 0 && row.impressions < minImpressions) return false;
    if (Number.isFinite(minClicks) && minClicks > 0 && row.clicks < minClicks) return false;
    if (params.view === "growing" && !(row.status === "growing" || row.status === "new_signal")) return false;
    if (params.view === "declining" && row.status !== "declining") return false;
    if (params.view === "no_data" && row.status !== "no_data") return false;
    if (params.view === "high_impressions_low_ctr" && !(row.impressions >= 100 && row.ctr < 0.01)) return false;
    if (params.view === "needs_update" && !(row.status === "declining" || row.status === "no_data" || row.opportunity === "ctr_opportunity" || row.opportunity === "ranking_opportunity")) return false;
    return true;
  });
  if (params.view === "top_click_growth") return [...filtered].sort((a, b) => (b.click_growth_pct ?? -Infinity) - (a.click_growth_pct ?? -Infinity)).slice(0, 25);
  if (params.view === "top_impression_growth") return [...filtered].sort((a, b) => (b.impression_growth_pct ?? -Infinity) - (a.impression_growth_pct ?? -Infinity)).slice(0, 25);
  return filtered;
}

export default async function MemberDashboard({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  const params = searchParams || {};
  const rangeKey = normalizeDateRangeKey(params.range);
  const range = getDateRange({ range: rangeKey, startDate: params.startDate, endDate: params.endDate });
  const metricPeriods = getDashboardMetricPeriods();
  const [dbRows, currentMonthRows, finalPerformanceData] = await Promise.all([
    getDbPerformance(rangeKey, range),
    getDbPerformance("current_month", metricPeriods.current_month),
    session.user.isAdmin ? getAllMemberPerformanceFinal().catch(() => []) : getMemberPerformanceFinalByMember(session.user.email).catch(() => null),
  ]);
  const visibleRows = session.user.isAdmin ? dbRows : filterRowsForEmail(dbRows, session.user.email, false);
  const selectedRows = filterPerformance(visibleRows, params);
  const summary = aggregateCompared(selectedRows);
  const currentMonthVisibleRows = session.user.isAdmin ? currentMonthRows : filterRowsForEmail(currentMonthRows, session.user.email, false);
  const currentMonthSelectedRows = filterPerformance(currentMonthVisibleRows, params);
  const projects = uniqueValues(visibleRows, "project");
  const members = uniqueValues(visibleRows, "member_name");
  const contentTypes = Array.from(new Set(visibleRows.map((row) => row.content_type).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const typeBreakdown = ["new_content", "audit", "update", "portfolio", ...contentTypes.filter((type) => !["new_content", "audit", "update", "portfolio"].includes(type))].map((type) => ({ type, rows: selectedRows.filter((row) => row.content_type === type) })).filter((entry) => entry.rows.length > 0);
  const activePreset = params.view || "all";
  const memberInsightName = session.user.isAdmin ? params.member || selectedRows[0]?.member_name || "" : selectedRows[0]?.member_name || "";
  const selectedRangeLabel = range.label;
  const finalPerformanceList = Array.isArray(finalPerformanceData) ? finalPerformanceData : (finalPerformanceData ? [finalPerformanceData] : []);
  const selectedFinalPerformance = finalPerformanceList.find((row) => !params.member || row.member_name === params.member) ?? finalPerformanceList[0] ?? null;

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><h2 className="text-2xl font-semibold">Hiệu suất đội SEO</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} đến {range.endDate}</p></div>
      <RefreshDataButton range={rangeKey} startDate={params.startDate} endDate={params.endDate} returnTo="/dashboard" preserve={params} />
    </div>
    <WarningList warnings={[...getEnvErrors(), ...selectedRows.map((p) => p.warning)]} />
    <SectionGrid>
      <MetricSection title={`Hiệu suất đội SEO: ${selectedRangeLabel}`} description="Các chỉ số khối lượng theo bộ lọc đã chọn." tone="quantity" metrics={[
        { label: "URL đang hoạt động", value: selectedRows.length },
        { label: "URL trong tháng này", value: currentMonthSelectedRows.length },
        { label: "Lượt nhấp hiện tại", value: fmtNum(summary.clicks) },
        { label: "Lượt nhấp kỳ trước", value: fmtNum(summary.previous_clicks) },
        { label: "Chênh lệch lượt nhấp", value: formatSignedNumber(summary.click_delta), tone: growthMetricTone(summary.click_delta) },
        { label: "Lượt hiển thị hiện tại", value: fmtNum(summary.impressions) },
        { label: "Lượt hiển thị kỳ trước", value: fmtNum(summary.previous_impressions) },
        { label: "Chênh lệch lượt hiển thị", value: formatSignedNumber(summary.impression_delta), tone: growthMetricTone(summary.impression_delta) },
      ]} />
      <MetricSection title="Phân bổ theo loại URL" description="Performance theo loại URL được theo dõi và bộ lọc đã chọn." tone="quality" metrics={typeBreakdown.length ? typeBreakdown.flatMap(({ type, rows }) => { const metrics = aggregateCompared(rows); return [{ label: `URL ${contentTypeLabel(type)}`, value: rows.length }, { label: `URL ${contentTypeLabel(type)} có dữ liệu`, value: rows.length - metrics.noData }, { label: `Lượt nhấp ${contentTypeLabel(type)}`, value: fmtNum(metrics.clicks) }, { label: `Lượt hiển thị ${contentTypeLabel(type)}`, value: fmtNum(metrics.impressions) }, { label: `URL ${contentTypeLabel(type)} tăng trưởng`, value: metrics.growing }, { label: `URL ${contentTypeLabel(type)} suy giảm`, value: metrics.declining }, { label: `URL ${contentTypeLabel(type)} chưa có dữ liệu`, value: metrics.noData }]; }) : [{ label: "URL đã phân loại", value: "Chưa có URL được phân loại" }]} />
      <PerformanceKpiPanel finalPerformance={selectedFinalPerformance} memberName={selectedFinalPerformance?.member_name} helper="URL chưa có dữ liệu được loại khỏi KPI cho đến khi đủ dữ liệu để đánh giá. Tín hiệu tăng trưởng mới được tính là tích cực." />
      <MetricSection title="Tăng trưởng SEO Performance" description="Chỉ số tăng trưởng và hiệu quả cho các URL đã chọn." tone="quality" metrics={[
        { label: "Tăng trưởng lượt nhấp %", value: fmtGrowth(summary.click_growth_pct), tone: growthMetricTone(summary.click_growth_pct) },
        { label: "Tăng trưởng lượt hiển thị %", value: fmtGrowth(summary.impression_growth_pct), tone: growthMetricTone(summary.impression_growth_pct) },
        { label: "CTR", value: fmtPct(summary.ctr), tone: "growth-neutral" },
        { label: "Vị trí trung bình", value: fmtPos(summary.position), tone: "growth-neutral" },
      ]} />
    </SectionGrid>
    {memberInsightName && <p className="mt-4"><Link className="text-blue-700" href={`/member-insights?member=${encodeURIComponent(memberInsightName)}`}>Mở trang chi tiết 1m/3m/6m</Link></p>}

    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h3 className="text-xl font-semibold">Hiệu suất URL</h3><p className="text-sm text-slate-500">Bảng dữ liệu đã lọc sử dụng các snapshot từ <code>dashboard_url_performance</code>.</p></div><Link className="text-sm text-blue-700" href="/dashboard">Đặt lại bộ lọc</Link></div>
      <div className="mb-5 flex flex-wrap gap-2">{presetViews.map((preset) => <Link key={preset.key} className={`rounded-full border px-3 py-1 text-sm ${activePreset === preset.key ? "bg-blue-700 text-white" : "bg-white text-slate-700"}`} href={cleanParams(params, { view: preset.key, sort: preset.sort, direction: preset.direction })}>{preset.label}</Link>)}</div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        <label className="text-sm text-slate-600">Dự án<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="project" defaultValue={params.project || ""}><option value="">Tất cả dự án</option>{projects.map((project) => <option key={project} value={project}>{project}</option>)}</select></label>
        {session.user.isAdmin && <label className="text-sm text-slate-600">Thành viên<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="member" defaultValue={params.member || ""}><option value="">Tất cả thành viên</option>{members.map((member) => <option key={member} value={member}>{member}</option>)}</select></label>}
        <label className="text-sm text-slate-600">Loại<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="contentType" defaultValue={params.contentType || ""}><option value="">Bất kỳ</option>{contentTypes.map((type) => <option key={type} value={type}>{contentTypeLabel(type)}</option>)}</select></label>
        <label className="text-sm text-slate-600">Trạng thái tăng trưởng<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="growthStatus" defaultValue={params.growthStatus || ""}><option value="">Bất kỳ</option>{growthStatusOptions.map((status) => <option key={status} value={status}>{uiLabel(status)}</option>)}</select></label>
        <label className="text-sm text-slate-600">Trạng thái cơ hội<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="opportunityStatus" defaultValue={params.opportunityStatus || ""}><option value="">Bất kỳ</option>{opportunityStatusOptions.map((status) => <option key={status} value={status}>{labelText(status)}</option>)}</select></label>
        <label className="text-sm text-slate-600">Khoảng ngày<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="range" defaultValue={rangeKey}>{rangeOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm text-slate-600">Tìm URL<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="searchUrl" defaultValue={params.searchUrl || ""} placeholder="/blog/vi-du" /></label>
        <label className="text-sm text-slate-600">Lượt hiển thị tối thiểu<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" min="0" name="minImpressions" type="number" defaultValue={params.minImpressions || ""} /></label>
        <label className="text-sm text-slate-600">Lượt nhấp tối thiểu<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" min="0" name="minClicks" type="number" defaultValue={params.minClicks || ""} /></label>
        <input type="hidden" name="view" value={activePreset} />
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}{params.direction && <input type="hidden" name="direction" value={params.direction} />}
        <label className="text-sm text-slate-600">Ngày bắt đầu tùy chỉnh<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="startDate" type="date" defaultValue={params.startDate} /></label>
        <label className="text-sm text-slate-600">Ngày kết thúc tùy chỉnh<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="endDate" type="date" defaultValue={params.endDate} /></label>
        <div className="flex items-end"><button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" type="submit">Áp dụng bộ lọc</button></div>
      </form>
    </section>

    <div className="mt-4"><UrlTable rows={selectedRows} sort={params.sort || "clicks"} direction={params.direction} preserve={params} /></div>
  </Shell>;
}
