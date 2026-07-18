import Link from "next/link";
import type { UrlMetrics, UrlPerformance } from "../lib/google";
import { labelText, type OpportunityLabel } from "../lib/metrics";
import { formatNumber, formatPercent, formatSignedPercent, getGrowthClassName } from "../lib/format";
import type { MemberPerformanceFinalSummary } from "../lib/postgres";
import { formatViDateTime, viLabel } from "../lib/i18n/vi";

export type UrlSortKey = "url" | "project" | "content_type" | "content_worked_at" | "clicks" | "impressions" | "ctr" | "position" | "click_growth_pct" | "impression_growth_pct" | "growth_status" | "refreshed_at";
export type UrlSortDirection = "asc" | "desc";
type LegacyUrlSortKey = UrlSortKey | "ctr_asc" | "position_asc" | "position_desc" | "opportunity";
type SortableUrlPerformance = UrlPerformance & { content_worked_at?: string | null; content_type?: string | null; click_growth_pct?: number | null; impression_growth_pct?: number | null; status?: string; refreshed_at?: string | null };

export function PageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8 2xl:px-10 ${className}`}>{children}</div>;
}

export function SectionGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid gap-5 xl:grid-cols-2 2xl:gap-6 ${className}`}>{children}</div>;
}

export function DataTableContainer({ children }: { children: React.ReactNode }) {
  return <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="min-w-full align-middle">{children}</div></div>;
}

export function Shell({ children, email, isAdmin }: { children: React.ReactNode; email?: string | null; isAdmin?: boolean }) {
  const navItems = !email ? [] : isAdmin ? [
    { href: "/admin", label: "Tổng quan" },
    { href: "/admin/sync", label: "Đồng bộ dữ liệu" },
    { href: "/admin/projects", label: "Cấu hình dự án" },
    { href: "/admin/data-source", label: "Nguồn dữ liệu" },
    { href: "/admin/member-performance", label: "Hiệu suất thành viên" },
    { href: "/admin/member-review", label: "Đánh giá thành viên" },
    { href: "/admin/kpi-close", label: "Chốt KPI" },
    { href: "/admin/rules", label: "Rules" },
  ] : [
    { href: "/dashboard", label: "Hiệu suất của tôi" },
    { href: "/my-urls", label: "URL của tôi" },
    { href: "/my-kpi", label: "KPI của tôi" },
  ];

  return <main className="min-h-screen w-full">
    <header className="border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
      <PageContainer className="py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Không gian KPI SEO</h1>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between xl:justify-end">
            <nav aria-label="Điều hướng chính" className="flex flex-wrap gap-2">
              {navItems.map((item) => <Link className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 sm:text-[15px]" href={item.href} key={item.href}>{item.label}</Link>)}
            </nav>
            {email && <div className="flex flex-wrap items-center gap-3 text-sm lg:justify-end">
              <span className="max-w-full truncate text-slate-500">{email}</span>
              <Link className="font-semibold text-blue-700 hover:text-blue-900" href="/api/auth/signout">Đăng xuất</Link>
            </div>}
          </div>
        </div>
      </PageContainer>
    </header>
    <PageContainer>{children}</PageContainer>
  </main>;
}

export function DateRangePicker({ range = "current_month", startDate, endDate, preserve = {} }: { range?: string; startDate?: string; endDate?: string; preserve?: Record<string, string | undefined> }) {
  const items = [["current_month", "Tháng hiện tại"], ["previous_month", "Tháng trước"], ["last_3_months", "3 tháng gần nhất"], ["last_6_months", "6 tháng gần nhất"], ["all_time", "Toàn thời gian"]];
  const href = (key: string) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v && k !== "startDate" && k !== "endDate") qs.set(k, v); }); qs.set("range", key); return `?${qs.toString()}`; };
  return <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex flex-wrap gap-2">{items.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 text-sm ${range === key ? "bg-blue-700 text-white" : "bg-white"}`} href={href(key)} key={key}>{label}</Link>)}</div><form className="flex flex-wrap items-end gap-3">{Object.entries(preserve).filter(([k, v]) => v && k !== "range" && k !== "startDate" && k !== "endDate").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="hidden" name="range" value="custom" /><label className="text-sm text-slate-600">Ngày bắt đầu<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2 sm:ml-2 sm:mt-0 sm:w-auto" name="startDate" type="date" defaultValue={startDate} /></label><label className="text-sm text-slate-600">Ngày kết thúc<input className="mt-1 w-full min-w-40 rounded-lg border px-3 py-2 sm:ml-2 sm:mt-0 sm:w-auto" name="endDate" type="date" defaultValue={endDate} /></label><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">Áp dụng khoảng tùy chỉnh</button></form></div>;
}

export type MetricTone = "neutral" | "quantity" | "growth-positive" | "growth-negative" | "growth-neutral" | "kpi-excellent" | "kpi-good" | "kpi-monitor" | "kpi-support" | "kpi-risk" | "kpi-null";
export type MetricItem = { label: string; value: React.ReactNode; tone?: MetricTone };

const metricToneStyles: Record<MetricTone, { card: string; label: string; value: string }> = {
  neutral: { card: "border-slate-200 bg-white", label: "text-slate-500", value: "text-slate-900" },
  quantity: { card: "border-blue-100 bg-white", label: "text-blue-700", value: "text-blue-950" },
  "growth-positive": { card: "border-green-100 bg-green-50/70", label: "text-green-700", value: "text-green-800" },
  "growth-negative": { card: "border-red-100 bg-red-50/70", label: "text-red-700", value: "text-red-800" },
  "growth-neutral": { card: "border-slate-200 bg-slate-50/80", label: "text-slate-500", value: "text-slate-700" },
  "kpi-excellent": { card: "border-green-200 bg-green-50", label: "text-green-700", value: "text-green-800" },
  "kpi-good": { card: "border-blue-200 bg-blue-50", label: "text-blue-700", value: "text-blue-800" },
  "kpi-monitor": { card: "border-yellow-200 bg-yellow-50", label: "text-yellow-700", value: "text-yellow-800" },
  "kpi-support": { card: "border-orange-200 bg-orange-50", label: "text-orange-700", value: "text-orange-800" },
  "kpi-risk": { card: "border-red-200 bg-red-50", label: "text-red-700", value: "text-red-800" },
  "kpi-null": { card: "border-slate-200 bg-slate-100", label: "text-slate-500", value: "text-slate-600" },
};

export function MetricCard({ label, value, tone = "neutral" }: MetricItem) {
  const styles = metricToneStyles[tone];
  return <div className={`min-h-32 rounded-2xl border p-5 shadow-sm sm:p-6 ${styles.card}`}><div className={`text-[13px] font-medium uppercase tracking-wide ${styles.label}`}>{label}</div><div className={`mt-3 text-2xl font-semibold leading-tight sm:text-3xl ${styles.value}`}>{value}</div></div>;
}

export function MetricSection({ title, description, metrics, tone = "quantity" }: { title: string; description?: string; metrics: MetricItem[]; tone?: "quantity" | "quality" }) {
  const styles = tone === "quantity"
    ? "border-blue-100 bg-blue-50/60"
    : "border-slate-200 bg-white";
  const heading = tone === "quantity" ? "text-blue-950" : "text-slate-950";
  const defaultMetricTone: MetricTone = tone === "quantity" ? "quantity" : "growth-neutral";
  return <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${styles}`}>
    <div className="mb-4">
      <h3 className={`text-lg font-semibold ${heading}`}>{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} tone={metric.tone || defaultMetricTone} />)}</div>
  </section>;
}

export function fmtPct(n: number) { return formatPercent(n); }
export function fmtNum(n: number) { return formatNumber(n); }
export function fmtPos(n: number) { return n ? n.toFixed(1) : "—"; }

export function MetricGrid({ metrics, count }: { metrics: UrlMetrics; count?: number }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{count !== undefined && <MetricCard label="Số URL" value={count} />}<MetricCard label="Lượt nhấp" value={fmtNum(metrics.clicks)} /><MetricCard label="Lượt hiển thị" value={fmtNum(metrics.impressions)} /><MetricCard label="CTR" value={fmtPct(metrics.ctr)} /><MetricCard label="Vị trí trung bình" value={fmtPos(metrics.position)} /></div>;
}

export function WarningList({ warnings }: { warnings: (string | undefined)[] }) {
  const unique = Array.from(new Set(warnings.filter(Boolean).map((warning) => warning === "pending_refresh" ? "Chưa làm mới dữ liệu" : warning)));
  if (!unique.length) return null;
  return <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Cảnh báo cấu hình:</strong><ul className="mt-2 list-disc pl-5">{unique.map((w) => <li key={w}>{w}</li>)}</ul></div>;
}

const opportunityRank: Record<OpportunityLabel, number> = { no_data: 5, ctr_opportunity: 1, ranking_opportunity: 2, winner: 0, low_visibility: 4, normal: 3 };
const growthStatusRank: Record<string, number> = { growing: 0, new_signal: 1, stable: 2, declining: 3, no_data: 4 };

function normalizeUrlSort(sort?: LegacyUrlSortKey, direction?: UrlSortDirection): { key: UrlSortKey; direction: UrlSortDirection } {
  if (sort === "ctr_asc") return { key: "ctr", direction: "asc" };
  if (sort === "position_asc") return { key: "position", direction: "asc" };
  if (sort === "position_desc") return { key: "position", direction: "desc" };
  if (sort === "opportunity") return { key: "growth_status", direction: direction || "asc" };
  const key = sort || "clicks";
  return { key, direction: direction || (key === "position" ? "asc" : "desc") };
}
function compareNullableNumber(a: number | null | undefined, b: number | null | undefined) { const am = a === null || a === undefined; const bm = b === null || b === undefined; if (am && bm) return 0; if (am) return 1; if (bm) return -1; return a - b; }
function compareString(a: string | null | undefined, b: string | null | undefined) { return (a || "").localeCompare(b || "", undefined, { sensitivity: "base" }); }
function compareDate(a: string | null | undefined, b: string | null | undefined) { const at = a ? new Date(a).getTime() : Number.NaN; const bt = b ? new Date(b).getTime() : Number.NaN; const am = Number.isNaN(at); const bm = Number.isNaN(bt); if (am && bm) return 0; if (am) return 1; if (bm) return -1; return at - bt; }
function sortedRows(rows: UrlPerformance[], sort: LegacyUrlSortKey, direction?: UrlSortDirection) {
  const normalized = normalizeUrlSort(sort, direction);
  return [...rows].sort((a, b) => { const left = a as SortableUrlPerformance; const right = b as SortableUrlPerformance; let result = 0;
    if (normalized.key === "url") result = compareString(left.url, right.url);
    else if (normalized.key === "project") result = compareString(left.project, right.project);
    else if (normalized.key === "clicks") result = left.clicks - right.clicks;
    else if (normalized.key === "content_worked_at") result = compareDate(left.content_worked_at, right.content_worked_at);
    else if (normalized.key === "content_type") result = compareString(left.content_type, right.content_type);
    else if (normalized.key === "impressions") result = left.impressions - right.impressions;
    else if (normalized.key === "ctr") result = left.ctr - right.ctr;
    else if (normalized.key === "position") result = compareNullableNumber(left.position || null, right.position || null);
    else if (normalized.key === "click_growth_pct") result = compareNullableNumber(left.click_growth_pct, right.click_growth_pct);
    else if (normalized.key === "impression_growth_pct") result = compareNullableNumber(left.impression_growth_pct, right.impression_growth_pct);
    else if (normalized.key === "growth_status") result = (growthStatusRank[left.status || left.opportunity] ?? opportunityRank[left.opportunity] ?? 99) - (growthStatusRank[right.status || right.opportunity] ?? opportunityRank[right.opportunity] ?? 99);
    else if (normalized.key === "refreshed_at") result = compareDate(left.refreshed_at, right.refreshed_at);
    return (normalized.direction === "asc" ? result : -result) || compareString(left.url, right.url);
  });
}
function fmtDateTime(value?: string | null) { return value ? formatViDateTime(value) : "Chưa làm mới"; }
function fmtWorkedDate(value?: string | null) { if (!value) return "Chưa có ngày làm việc"; const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`); return Number.isNaN(date.getTime()) ? "Chưa có ngày làm việc" : date.toISOString().slice(0, 10); }
export function contentTypeLabel(value?: string | null) { const labels: Record<string, string> = { new_content: "Nội dung mới", audit: "Audit", update: "Cập nhật", portfolio: "Danh mục nền" }; return value ? (labels[value] ?? viLabel(value)) : "Chưa có loại"; }
export function UrlTable({ rows, sort = "clicks", direction, basePath = "", preserve = {} }: { rows: UrlPerformance[]; sort?: LegacyUrlSortKey; direction?: UrlSortDirection; basePath?: string; preserve?: Record<string, string | undefined> }) {
  const activeSort = normalizeUrlSort(sort, direction || (preserve.direction as UrlSortDirection | undefined));
  const href = (key: UrlSortKey) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v && k !== "sort" && k !== "direction") qs.set(k, v); }); qs.set("sort", key); qs.set("direction", activeSort.key === key && activeSort.direction === "asc" ? "desc" : "asc"); const query = qs.toString(); return `${basePath}${query ? `?${query}` : ""}`; };
  const header = (key: UrlSortKey, label: string, className = "") => { const active = activeSort.key === key; const nextDirection = active && activeSort.direction === "asc" ? "giảm dần" : "tăng dần"; return <th className={className || undefined}><Link aria-label={`Sắp xếp theo ${label} ${nextDirection}`} aria-sort={active ? (activeSort.direction === "asc" ? "ascending" : "descending") : undefined} className={`inline-flex items-center gap-1 py-3 pr-3 font-semibold ${active ? "text-blue-700" : "text-slate-700 hover:text-blue-700"}`} href={href(key)}>{label}<span aria-hidden="true" className={active ? "text-blue-700" : "text-slate-400"}>{active ? (activeSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>; };
  return <DataTableContainer><table className="w-full min-w-[1360px] table-auto text-[13px] sm:text-sm"><thead className="bg-slate-100 text-left"><tr>{header("url", "URL", "p-3")}{header("project", "Dự án")}<th>Thành viên</th>{header("content_worked_at", "Ngày làm việc")}{header("content_type", "Loại")}{header("clicks", "Lượt nhấp")}{header("impressions", "Lượt hiển thị")}{header("ctr", "CTR")}{header("position", "Vị trí")}{header("click_growth_pct", "Tăng trưởng click")}{header("impression_growth_pct", "Tăng trưởng hiển thị")}{header("growth_status", "Trạng thái")}<th>Cơ hội</th>{header("refreshed_at", "Làm mới lúc")}</tr></thead><tbody>{sortedRows(rows, activeSort.key, activeSort.direction).map((row) => { const r = row as SortableUrlPerformance; return <tr className="border-t" key={r.id}><td className="w-[34rem] max-w-[34rem] p-3"><Link className="block truncate text-blue-700" title={r.url} href={`/url/${r.id}`}>{r.url}</Link>{r.warning && <div className="text-xs text-amber-700">{r.warning}</div>}</td><td>{r.project}</td><td>{r.member_name}</td><td>{fmtWorkedDate(r.content_worked_at)}</td><td><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">{contentTypeLabel(r.content_type)}</span></td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td><td><span className={getGrowthClassName(r.click_growth_pct)}>{r.click_growth_pct === undefined ? "—" : fmtGrowth(r.click_growth_pct)}</span></td><td><span className={getGrowthClassName(r.impression_growth_pct)}>{r.impression_growth_pct === undefined ? "—" : fmtGrowth(r.impression_growth_pct)}</span></td><td>{r.status ? <StatusBadge status={r.status} /> : "—"}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{labelText(r.opportunity)}</span></td><td>{fmtDateTime(r.refreshed_at)}</td></tr>; })}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={14}>Không tìm thấy URL phù hợp.</td></tr>}</tbody></table></DataTableContainer>;
}

export function fmtGrowth(n: number | null) { return n === null ? "—" : formatSignedPercent(n * 100); }
export function kpiTone(value: number | null | undefined): MetricTone {
  if (value === null || value === undefined) return "kpi-null";
  if (value >= 85) return "kpi-excellent";
  if (value >= 70) return "kpi-good";
  if (value >= 50) return "kpi-monitor";
  if (value >= 30) return "kpi-support";
  return "kpi-risk";
}

export function fmtKpi(value: number | null | undefined) { return value == null ? "Chưa đủ dữ liệu" : `${value.toFixed(0)}%`; }
function statusLabel(status?: string | null) { return viLabel(status || "insufficient_data"); }
function rangeMetric(finalPerformance: MemberPerformanceFinalSummary | null | undefined, key: "1m" | "3m" | "6m" | "all_time", weight: string) {
  const value = finalPerformance?.[`performance_kpi_${key}_pct` as keyof MemberPerformanceFinalSummary] as number | null | undefined;
  const eligible = key === "all_time" ? undefined : finalPerformance?.[`eligible_url_count_${key}` as keyof MemberPerformanceFinalSummary] as number | null | undefined;
  const excluded = key === "all_time" ? undefined : finalPerformance?.[`excluded_no_data_url_count_${key}` as keyof MemberPerformanceFinalSummary] as number | null | undefined;
  return { label: `${key === "all_time" ? "Toàn thời gian" : key.toUpperCase()} KPI`, value: <div><div>{fmtKpi(value)}</div><div className="mt-2 text-sm font-normal text-slate-600">Trọng số {weight}{key !== "all_time" ? ` · URL đủ điều kiện ${eligible ?? 0} · URL thiếu dữ liệu bị loại ${excluded ?? 0}` : " · làm mới tùy chọn"}</div>{value == null && <div className="mt-2 text-xs font-medium text-slate-500">Không tính vào KPI cuối cùng; trọng số còn lại được chuẩn hóa.</div>}</div>, tone: kpiTone(value) };
}

export function PerformanceKpiPanel({ finalPerformance, memberName, helper }: { finalPerformance?: MemberPerformanceFinalSummary | null; memberName?: string; helper?: string }) {
  const rawValue = finalPerformance?.raw_performance_final_pct ?? finalPerformance?.performance_final_pct;
  const adjustedValue = finalPerformance?.adjusted_performance_final_pct ?? rawValue;
  return <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${metricToneStyles[kpiTone(adjustedValue)].card}`}>
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Điểm Hiệu suất thô cuối cùng %</p><h3 className={`mt-1 text-4xl font-bold ${metricToneStyles[kpiTone(rawValue)].value}`}>{fmtKpi(rawValue)}</h3><p className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Điểm Hiệu suất sau điều chỉnh %</p><h3 className={`mt-1 text-3xl font-bold ${metricToneStyles[kpiTone(adjustedValue)].value}`}>{fmtKpi(adjustedValue)}</h3>{adjustedValue != null && rawValue != null && adjustedValue > rawValue && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-sm font-medium text-blue-800">Điểm được nâng theo quy tắc bảo vệ KPI dự án.</p>}{memberName && <p className="mt-1 text-sm text-slate-600">{memberName}</p>}</div><div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[520px]"><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Trạng thái điều chỉnh</span><strong>{statusLabel(finalPerformance?.adjustment_status || finalPerformance?.performance_final_status)}</strong></div><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Loại KPI dự án</span><strong>{statusLabel(finalPerformance?.project_kpi_type || "growth_project")}</strong></div><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Cần PM đánh giá</span><strong>{finalPerformance?.pm_review_required ? "Có" : "Không"}</strong></div><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Độ tin cậy</span><strong>{viLabel(finalPerformance?.performance_confidence || "low")}</strong></div><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Độ phủ</span><strong>{finalPerformance ? fmtPct(finalPerformance.performance_final_coverage) : "—"}</strong></div><div className="rounded-xl bg-white/70 p-3"><span className="block text-xs uppercase text-slate-500">Trạng thái điểm thô</span><strong>{statusLabel(finalPerformance?.performance_final_status)}</strong></div></div></div>
    <p className="rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700"><strong>Công thức:</strong> KPI cuối cùng dùng trọng số do quản trị viên cấu hình (mặc định 1T × 30% + 3T × 40% + 6T × 20% + toàn thời gian × 10%). Kỳ thiếu dữ liệu bị loại và trọng số còn lại được chuẩn hóa.</p>
    {finalPerformance?.adjustment_reason && <p className="mt-3 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700"><strong>Lý do điều chỉnh:</strong> {finalPerformance.adjustment_reason}</p>}
    {helper && <p className="mt-3 text-sm text-slate-700">{helper}</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-4"><MetricCard {...rangeMetric(finalPerformance, "1m", "30%")} /><MetricCard {...rangeMetric(finalPerformance, "3m", "40%")} /><MetricCard {...rangeMetric(finalPerformance, "6m", "20%")} /><MetricCard {...rangeMetric(finalPerformance, "all_time", "10%")} /></div>
  </section>;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string,string> = { growing: "bg-green-100 text-green-800", new_signal: "bg-emerald-100 text-emerald-800", declining: "bg-red-100 text-red-800", stable: "bg-slate-100 text-slate-700", no_data: "bg-slate-100 text-slate-700" };
  const arrow = status === "growing" || status === "new_signal" ? "↗" : status === "declining" ? "↘" : "→";
  const label = status === "new_signal" ? "Tín hiệu tăng trưởng mới" : status === "no_data" ? "Chưa đủ dữ liệu — không tính KPI Hiệu suất" : viLabel(status);
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? styles.stable}`}>{arrow} {label}</span>;
}
export function RefreshDataButton({ range, startDate, endDate, returnTo, preserve = {} }: { range?: string; startDate?: string; endDate?: string; returnTo?: string; preserve?: Record<string, string | undefined> }) {
  return <form action="/api/refresh/cache" method="post"><input type="hidden" name="range" value={range || "current_month"} />{startDate && <input type="hidden" name="startDate" value={startDate} />}{endDate && <input type="hidden" name="endDate" value={endDate} />}{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}{Object.entries(preserve).filter(([k, v]) => v && !["range", "startDate", "endDate"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<button className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800" type="submit">Làm mới Hiệu suất GSC</button></form>;
}
