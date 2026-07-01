import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDashboardMetricPeriods, getDateRange, normalizeDateRangeKey } from "../../../lib/dates";
import { getEnvErrors } from "../../../lib/env";
import { filterRowsForEmail } from "../../../lib/google";
import { getDbPerformance, getAllMemberPerformanceFinal, getMemberPerformanceFinalByMember } from "../../../lib/postgres";
import { aggregateCompared, type GrowthStatus } from "../../../lib/growth";
import { fmtGrowth, fmtNum, fmtPct, fmtPos, MetricSection, RefreshDataButton, SectionGrid, Shell, UrlTable, WarningList, type MetricTone } from "../../../components/ui";
import { formatSignedNumber } from "../../../lib/format";
import { type OpportunityLabel } from "../../../lib/metrics";
import Link from "next/link";

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
  view?: PresetView;
};

type PresetView = "all" | "growing" | "declining" | "no_data" | "high_impressions_low_ctr" | "top_click_growth" | "top_impression_growth" | "needs_update";

const growthStatusOptions: GrowthStatus[] = ["growing", "new_signal", "declining", "stable", "no_data"];
const opportunityStatusOptions: OpportunityLabel[] = ["no_data", "ctr_opportunity", "ranking_opportunity", "winner", "low_visibility", "normal"];
const rangeOptions = [["current_month", "Current month"], ["previous_month", "Previous month"], ["last_3_months", "Last 3 months"], ["last_6_months", "Last 6 months"], ["all_time", "All time"], ["custom", "Custom"]] as const;
const presetViews: { key: PresetView; label: string; sort?: SearchParams["sort"]; direction?: SearchParams["direction"] }[] = [
  { key: "all", label: "All URLs" },
  { key: "growing", label: "Growing URLs", sort: "click_growth_pct", direction: "desc" },
  { key: "declining", label: "Declining URLs", sort: "click_growth_pct", direction: "asc" },
  { key: "no_data", label: "No Data URLs", sort: "impressions", direction: "asc" },
  { key: "high_impressions_low_ctr", label: "High Impressions, Low CTR", sort: "impressions", direction: "desc" },
  { key: "top_click_growth", label: "Top Click Growth", sort: "click_growth_pct", direction: "desc" },
  { key: "top_impression_growth", label: "Top Impression Growth", sort: "impression_growth_pct", direction: "desc" },
  { key: "needs_update", label: "Needs Update", sort: "refreshed_at", direction: "asc" }
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
  const activePreset = params.view || "all";
  const memberInsightName = session.user.isAdmin ? params.member || selectedRows[0]?.member_name || "" : selectedRows[0]?.member_name || "";
  const selectedRangeLabel = range.label;
  const finalPerformanceList = Array.isArray(finalPerformanceData) ? finalPerformanceData : (finalPerformanceData ? [finalPerformanceData] : []);
  const selectedFinalPerformance = finalPerformanceList.find((row) => !params.member || row.member_name === params.member) ?? finalPerformanceList[0] ?? null;

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><h2 className="text-2xl font-semibold">SEO Team Performance</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</p></div>
      <RefreshDataButton range={rangeKey} startDate={params.startDate} endDate={params.endDate} returnTo="/dashboard" preserve={params} />
    </div>
    <WarningList warnings={[...getEnvErrors(), ...selectedRows.map((p) => p.warning)]} />
    <SectionGrid>
      <MetricSection title={`SEO Team Performance: ${selectedRangeLabel}`} description="Volume-only metrics for the selected filters." tone="quantity" metrics={[
        { label: "Active URLs", value: selectedRows.length },
        { label: "URLs this month", value: currentMonthSelectedRows.length },
        { label: "Current Clicks", value: fmtNum(summary.clicks) },
        { label: "Previous Clicks", value: fmtNum(summary.previous_clicks) },
        { label: "Click Delta", value: formatSignedNumber(summary.click_delta), tone: growthMetricTone(summary.click_delta) },
        { label: "Current Impressions", value: fmtNum(summary.impressions) },
        { label: "Previous Impressions", value: fmtNum(summary.previous_impressions) },
        { label: "Impression Delta", value: formatSignedNumber(summary.impression_delta), tone: growthMetricTone(summary.impression_delta) },
      ]} />
      <MetricSection title="Final SEO Performance KPI" description="Weighted KPI from 1M, 3M, and 6M member cache ranges." tone="quality" metrics={[
        { label: "Final KPI %", value: selectedFinalPerformance?.performance_final_pct == null ? "—" : `${selectedFinalPerformance.performance_final_pct.toFixed(2)}%` },
        { label: "Final Status", value: selectedFinalPerformance?.performance_final_status?.replace(/_/g, " ") || "insufficient data" },
        { label: "Coverage", value: selectedFinalPerformance ? fmtPct(selectedFinalPerformance.performance_final_coverage) : "—" },
        { label: "Confidence", value: selectedFinalPerformance?.performance_confidence || "none" },
        { label: "1M KPI", value: selectedFinalPerformance?.performance_kpi_1m_pct == null ? "—" : `${selectedFinalPerformance.performance_kpi_1m_pct.toFixed(2)}%` },
        { label: "3M KPI", value: selectedFinalPerformance?.performance_kpi_3m_pct == null ? "—" : `${selectedFinalPerformance.performance_kpi_3m_pct.toFixed(2)}%` },
        { label: "6M KPI", value: selectedFinalPerformance?.performance_kpi_6m_pct == null ? "—" : `${selectedFinalPerformance.performance_kpi_6m_pct.toFixed(2)}%` },
        { label: "Refreshed", value: selectedFinalPerformance?.refreshed_at ? selectedFinalPerformance.refreshed_at.slice(0, 19) : "—" },
      ]} />
      <MetricSection title="SEO Performance Growth" description="Growth and efficiency metrics for the selected URLs." tone="quality" metrics={[
        { label: "Click Growth %", value: fmtGrowth(summary.click_growth_pct), tone: growthMetricTone(summary.click_growth_pct) },
        { label: "Impression Growth %", value: fmtGrowth(summary.impression_growth_pct), tone: growthMetricTone(summary.impression_growth_pct) },
        { label: "CTR", value: fmtPct(summary.ctr), tone: "growth-neutral" },
        { label: "Avg Position", value: fmtPos(summary.position), tone: "growth-neutral" },
      ]} />
    </SectionGrid>
    {memberInsightName && <p className="mt-4"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(memberInsightName)}`}>Open 1m/3m/6m detail page</Link></p>}

    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h3 className="text-xl font-semibold">URL performance</h3><p className="text-sm text-slate-500">One filtered table powered by dashboard_url_performance snapshots.</p></div><Link className="text-sm text-blue-700" href="/dashboard">Reset filters</Link></div>
      <div className="mb-5 flex flex-wrap gap-2">{presetViews.map((preset) => <Link key={preset.key} className={`rounded-full border px-3 py-1 text-sm ${activePreset === preset.key ? "bg-blue-700 text-white" : "bg-white text-slate-700"}`} href={cleanParams(params, { view: preset.key, sort: preset.sort, direction: preset.direction })}>{preset.label}</Link>)}</div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        <label className="text-sm text-slate-600">Project<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="project" defaultValue={params.project || ""}><option value="">All projects</option>{projects.map((project) => <option key={project} value={project}>{project}</option>)}</select></label>
        {session.user.isAdmin && <label className="text-sm text-slate-600">Member<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="member" defaultValue={params.member || ""}><option value="">All members</option>{members.map((member) => <option key={member} value={member}>{member}</option>)}</select></label>}
        <label className="text-sm text-slate-600">Growth Status<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="growthStatus" defaultValue={params.growthStatus || ""}><option value="">Any</option>{growthStatusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select></label>
        <label className="text-sm text-slate-600">Opportunity Status<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="opportunityStatus" defaultValue={params.opportunityStatus || ""}><option value="">Any</option>{opportunityStatusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select></label>
        <label className="text-sm text-slate-600">Date Range<select className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="range" defaultValue={rangeKey}>{rangeOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm text-slate-600">Search URL<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="searchUrl" defaultValue={params.searchUrl || ""} placeholder="/blog/example" /></label>
        <label className="text-sm text-slate-600">Min Impressions<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" min="0" name="minImpressions" type="number" defaultValue={params.minImpressions || ""} /></label>
        <label className="text-sm text-slate-600">Min Clicks<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" min="0" name="minClicks" type="number" defaultValue={params.minClicks || ""} /></label>
        <input type="hidden" name="view" value={activePreset} />
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}{params.direction && <input type="hidden" name="direction" value={params.direction} />}
        <label className="text-sm text-slate-600">Custom start<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="startDate" type="date" defaultValue={params.startDate} /></label>
        <label className="text-sm text-slate-600">Custom end<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2" name="endDate" type="date" defaultValue={params.endDate} /></label>
        <div className="flex items-end"><button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" type="submit">Apply filters</button></div>
      </form>
    </section>

    <div className="mt-4"><UrlTable rows={selectedRows} sort={params.sort || "clicks"} direction={params.direction} preserve={params} /></div>
  </Shell>;
}
