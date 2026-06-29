import Link from "next/link";
import type { UrlMetrics, UrlPerformance } from "../lib/google";
import { labelText, type OpportunityLabel } from "../lib/metrics";

export type UrlSortKey = "url" | "project" | "clicks" | "impressions" | "ctr" | "position" | "click_growth_pct" | "impression_growth_pct" | "growth_status" | "refreshed_at";
export type UrlSortDirection = "asc" | "desc";
type LegacyUrlSortKey = UrlSortKey | "ctr_asc" | "position_asc" | "position_desc" | "opportunity";
type SortableUrlPerformance = UrlPerformance & { click_growth_pct?: number | null; impression_growth_pct?: number | null; status?: string; refreshed_at?: string | null };

export function Shell({ children, email, isAdmin }: { children: React.ReactNode; email?: string | null; isAdmin?: boolean }) {
  const navItems = [
    { href: "/dashboard", label: "My Performance" },
    { href: "/url-data-source", label: "URL Data Source" },
    ...(isAdmin ? [
      { href: "/member-insights", label: "Member Insights" },
      { href: "/admin", label: "Admin" },
    ] : []),
  ];

  return <main className="mx-auto max-w-7xl p-6">
    <div className="mb-8 flex flex-col gap-5 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-3xl font-bold">SEO Team Performance Tracking</h1>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between lg:justify-end">
        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {navItems.map((item) => <Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        {email && <div className="flex flex-wrap items-center gap-3 text-sm md:justify-end">
          <span className="text-slate-500">{email}</span>
          <a className="font-semibold text-blue-700 hover:text-blue-900" href="/api/auth/signout">Sign out</a>
        </div>}
      </div>
    </div>
    {children}
  </main>;
}

export function DateRangePicker({ range = "current_month", startDate, endDate, preserve = {} }: { range?: string; startDate?: string; endDate?: string; preserve?: Record<string, string | undefined> }) {
  const items = [["current_month", "Current month"], ["previous_month", "Previous month"], ["last_3_months", "Last 3 months"], ["last_6_months", "Last 6 months"], ["all_time", "All time"]];
  const href = (key: string) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v && k !== "startDate" && k !== "endDate") qs.set(k, v); }); qs.set("range", key); return `?${qs.toString()}`; };
  return <div className="mb-6 rounded-xl border bg-white p-4"><div className="mb-3 flex flex-wrap gap-2">{items.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 text-sm ${range === key ? "bg-blue-700 text-white" : "bg-white"}`} href={href(key)} key={key}>{label}</Link>)}</div><form className="flex flex-wrap items-end gap-3">{Object.entries(preserve).filter(([k, v]) => v && k !== "range" && k !== "startDate" && k !== "endDate").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="hidden" name="range" value="custom" /><label className="text-sm text-slate-600">Custom start<input className="ml-2 rounded border px-2 py-1" name="startDate" type="date" defaultValue={startDate} /></label><label className="text-sm text-slate-600">End<input className="ml-2 rounded border px-2 py-1" name="endDate" type="date" defaultValue={endDate} /></label><button className="rounded bg-slate-900 px-3 py-1 text-sm text-white" type="submit">Apply custom range</button></form></div>;
}

export type MetricTone = "neutral" | "quantity" | "growth-positive" | "growth-negative" | "growth-neutral";
export type MetricItem = { label: string; value: React.ReactNode; tone?: MetricTone };

const metricToneStyles: Record<MetricTone, { card: string; label: string; value: string }> = {
  neutral: { card: "border-slate-200 bg-white", label: "text-slate-500", value: "text-slate-900" },
  quantity: { card: "border-blue-100 bg-white", label: "text-blue-700", value: "text-blue-950" },
  "growth-positive": { card: "border-green-100 bg-green-50/70", label: "text-green-700", value: "text-green-800" },
  "growth-negative": { card: "border-red-100 bg-red-50/70", label: "text-red-700", value: "text-red-800" },
  "growth-neutral": { card: "border-slate-200 bg-slate-50/80", label: "text-slate-500", value: "text-slate-700" },
};

export function MetricCard({ label, value, tone = "neutral" }: MetricItem) {
  const styles = metricToneStyles[tone];
  return <div className={`rounded-xl border p-5 shadow-sm ${styles.card}`}><div className={`text-sm ${styles.label}`}>{label}</div><div className={`mt-2 text-2xl font-semibold ${styles.value}`}>{value}</div></div>;
}

export function MetricSection({ title, description, metrics, tone = "quantity" }: { title: string; description?: string; metrics: MetricItem[]; tone?: "quantity" | "quality" }) {
  const styles = tone === "quantity"
    ? "border-blue-100 bg-blue-50/60"
    : "border-slate-200 bg-white";
  const heading = tone === "quantity" ? "text-blue-950" : "text-slate-950";
  const defaultMetricTone: MetricTone = tone === "quantity" ? "quantity" : "growth-neutral";
  return <section className={`rounded-2xl border p-4 shadow-sm ${styles}`}>
    <div className="mb-4">
      <h3 className={`text-lg font-semibold ${heading}`}>{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} tone={metric.tone || defaultMetricTone} />)}</div>
  </section>;
}

export function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }
export function fmtNum(n: number) { return Math.round(n).toLocaleString(); }
export function fmtPos(n: number) { return n ? n.toFixed(1) : "—"; }

export function MetricGrid({ metrics, count }: { metrics: UrlMetrics; count?: number }) {
  return <div className="grid gap-4 md:grid-cols-5">{count !== undefined && <MetricCard label="URL count" value={count} />}<MetricCard label="Clicks" value={fmtNum(metrics.clicks)} /><MetricCard label="Impressions" value={fmtNum(metrics.impressions)} /><MetricCard label="CTR" value={fmtPct(metrics.ctr)} /><MetricCard label="Avg. position" value={fmtPos(metrics.position)} /></div>;
}

export function WarningList({ warnings }: { warnings: (string | undefined)[] }) {
  const unique = Array.from(new Set(warnings.filter(Boolean).map((warning) => warning === "pending_refresh" ? "Not refreshed yet" : warning)));
  if (!unique.length) return null;
  return <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Setup warnings:</strong><ul className="mt-2 list-disc pl-5">{unique.map((w) => <li key={w}>{w}</li>)}</ul></div>;
}

const opportunityRank: Record<OpportunityLabel, number> = { no_data: 0, ctr_opportunity: 1, ranking_opportunity: 2, winner: 3, low_visibility: 4, normal: 5 };
const growthStatusRank: Record<string, number> = { growing: 0, new_signal: 1, declining: 2, stable: 3, no_data: 4 };

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
function fmtDateTime(value?: string | null) { if (!value) return "Not refreshed yet"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(); }
export function UrlTable({ rows, sort = "clicks", direction, basePath = "", preserve = {} }: { rows: UrlPerformance[]; sort?: LegacyUrlSortKey; direction?: UrlSortDirection; basePath?: string; preserve?: Record<string, string | undefined> }) {
  const activeSort = normalizeUrlSort(sort, direction || (preserve.direction as UrlSortDirection | undefined));
  const href = (key: UrlSortKey) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v && k !== "sort" && k !== "direction") qs.set(k, v); }); qs.set("sort", key); qs.set("direction", activeSort.key === key && activeSort.direction === "asc" ? "desc" : "asc"); const query = qs.toString(); return `${basePath}${query ? `?${query}` : ""}`; };
  const header = (key: UrlSortKey, label: string, className = "") => { const active = activeSort.key === key; const nextDirection = active && activeSort.direction === "asc" ? "descending" : "ascending"; return <th className={className || undefined}><Link aria-label={`Sort by ${label} ${nextDirection}`} aria-sort={active ? (activeSort.direction === "asc" ? "ascending" : "descending") : undefined} className={`inline-flex items-center gap-1 py-3 pr-3 font-semibold ${active ? "text-blue-700" : "text-slate-700 hover:text-blue-700"}`} href={href(key)}>{label}<span aria-hidden="true" className={active ? "text-blue-700" : "text-slate-400"}>{active ? (activeSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>; };
  return <div><div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr>{header("url", "URL", "p-3")}{header("project", "Project")}<th>Member</th>{header("clicks", "Clicks")}{header("impressions", "Impr.")}{header("ctr", "CTR")}{header("position", "Pos.")}{header("click_growth_pct", "Click Growth")}{header("impression_growth_pct", "Impr. Growth")}{header("growth_status", "Status")}<th>Opportunity</th>{header("refreshed_at", "Refreshed")}</tr></thead><tbody>{sortedRows(rows, activeSort.key, activeSort.direction).map((row) => { const r = row as SortableUrlPerformance; return <tr className="border-t" key={r.id}><td className="max-w-xl p-3 break-all"><Link className="text-blue-700" href={`/url/${r.id}`}>{r.url}</Link>{r.warning && <div className="text-xs text-amber-700">{r.warning}</div>}</td><td>{r.project}</td><td>{r.member_name}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td><td>{r.click_growth_pct === undefined ? "—" : fmtGrowth(r.click_growth_pct)}</td><td>{r.impression_growth_pct === undefined ? "—" : fmtGrowth(r.impression_growth_pct)}</td><td>{r.status ? <StatusBadge status={r.status} /> : "—"}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{labelText(r.opportunity)}</span></td><td>{fmtDateTime(r.refreshed_at)}</td></tr>; })}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={12}>No URLs found for this account.</td></tr>}</tbody></table></div></div>;
}

export function fmtGrowth(n: number | null) { return n === null ? "New growth" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`; }
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string,string> = { growing: "bg-green-100 text-green-800", new_signal: "bg-emerald-100 text-emerald-800", declining: "bg-red-100 text-red-800", stable: "bg-slate-100 text-slate-700", no_data: "bg-amber-100 text-amber-800" };
  const arrow = status === "growing" || status === "new_signal" ? "↗" : status === "declining" ? "↘" : "→";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? styles.stable}`}>{arrow} {status.replace(/_/g, " ")}</span>;
}
export function RefreshDataButton({ range, startDate, endDate, returnTo, preserve = {} }: { range?: string; startDate?: string; endDate?: string; returnTo?: string; preserve?: Record<string, string | undefined> }) {
  return <form action="/api/refresh/cache" method="post"><input type="hidden" name="range" value={range || "current_month"} />{startDate && <input type="hidden" name="startDate" value={startDate} />}{endDate && <input type="hidden" name="endDate" value={endDate} />}{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}{Object.entries(preserve).filter(([k, v]) => v && !["range", "startDate", "endDate"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<button className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Refresh GSC Performance</button></form>;
}
