import Link from "next/link";
import type { UrlMetrics, UrlPerformance } from "../lib/google";
import { labelText, type OpportunityLabel } from "../lib/metrics";

export type UrlSortKey = "clicks" | "impressions" | "ctr_asc" | "position_asc" | "position_desc" | "opportunity";

export function Shell({ children, email, isAdmin }: { children: React.ReactNode; email?: string | null; isAdmin?: boolean }) {
  return <main className="mx-auto max-w-7xl p-6"><div className="mb-8 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-bold">Member Performance Tracking</h1><p className="text-slate-600">Phase 2 SEO portfolio health, priorities, and Search Console trends.</p></div><div className="flex flex-wrap gap-3 text-sm"><Link href="/dashboard">My Performance</Link><Link href="/dashboard/urls">My URLs</Link>{isAdmin && <><Link href="/admin">Team View</Link><Link href="/admin/urls">URLs</Link><Link href="/admin/members">Members</Link><Link className="text-slate-400" href="/admin/projects">Projects</Link></>}<span className="text-slate-500">{email}</span>{email && <a href="/api/auth/signout">Sign out</a>}</div></div>{children}</main>;
}

export function DateRangePicker({ range = "28d", startDate, endDate, preserve = {} }: { range?: string; startDate?: string; endDate?: string; preserve?: Record<string, string | undefined> }) {
  const items = [["28d", "Last 28 days"], ["3m", "Last 3 months"], ["6m", "Last 6 months"], ["12m", "Last 12 months"], ["all", "All time"]];
  const href = (key: string) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v && k !== "startDate" && k !== "endDate") qs.set(k, v); }); qs.set("range", key); return `?${qs.toString()}`; };
  return <div className="mb-6 rounded-xl border bg-white p-4"><div className="mb-3 flex flex-wrap gap-2">{items.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 text-sm ${range === key ? "bg-blue-700 text-white" : "bg-white"}`} href={href(key)} key={key}>{label}</Link>)}</div><form className="flex flex-wrap items-end gap-3">{Object.entries(preserve).filter(([k, v]) => v && k !== "range" && k !== "startDate" && k !== "endDate").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="hidden" name="range" value="custom" /><label className="text-sm text-slate-600">Custom start<input className="ml-2 rounded border px-2 py-1" name="startDate" type="date" defaultValue={startDate} /></label><label className="text-sm text-slate-600">End<input className="ml-2 rounded border px-2 py-1" name="endDate" type="date" defaultValue={endDate} /></label><button className="rounded bg-slate-900 px-3 py-1 text-sm text-white" type="submit">Apply custom range</button></form></div>;
}

export function MetricCard({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

export function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }
export function fmtNum(n: number) { return Math.round(n).toLocaleString(); }
export function fmtPos(n: number) { return n ? n.toFixed(1) : "—"; }

export function MetricGrid({ metrics, count }: { metrics: UrlMetrics; count?: number }) {
  return <div className="grid gap-4 md:grid-cols-5">{count !== undefined && <MetricCard label="URL count" value={count} />}<MetricCard label="Clicks" value={fmtNum(metrics.clicks)} /><MetricCard label="Impressions" value={fmtNum(metrics.impressions)} /><MetricCard label="CTR" value={fmtPct(metrics.ctr)} /><MetricCard label="Avg. position" value={fmtPos(metrics.position)} /></div>;
}

export function WarningList({ warnings }: { warnings: (string | undefined)[] }) {
  const unique = Array.from(new Set(warnings.filter(Boolean)));
  if (!unique.length) return null;
  return <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Setup warnings:</strong><ul className="mt-2 list-disc pl-5">{unique.map((w) => <li key={w}>{w}</li>)}</ul></div>;
}

const opportunityRank: Record<OpportunityLabel, number> = { no_data: 0, ctr_opportunity: 1, ranking_opportunity: 2, winner: 3, low_visibility: 4, normal: 5 };

function sortedRows(rows: UrlPerformance[], sort: UrlSortKey) {
  return [...rows].sort((a, b) => {
    if (sort === "impressions") return b.impressions - a.impressions;
    if (sort === "ctr_asc") return a.ctr - b.ctr;
    if (sort === "position_asc") return (a.position || Number.MAX_SAFE_INTEGER) - (b.position || Number.MAX_SAFE_INTEGER);
    if (sort === "position_desc") return b.position - a.position;
    if (sort === "opportunity") return opportunityRank[a.opportunity] - opportunityRank[b.opportunity];
    return b.clicks - a.clicks;
  });
}

export function UrlTable({ rows, sort = "clicks", basePath = "", preserve = {} }: { rows: UrlPerformance[]; sort?: UrlSortKey; basePath?: string; preserve?: Record<string, string | undefined> }) {
  const sorts: [UrlSortKey, string][] = [["clicks", "Clicks desc"], ["impressions", "Impressions desc"], ["ctr_asc", "CTR asc"], ["position_asc", "Position asc"], ["position_desc", "Position desc"], ["opportunity", "Opportunity"]];
  const href = (key: UrlSortKey) => { const qs = new URLSearchParams(); Object.entries(preserve).forEach(([k, v]) => { if (v) qs.set(k, v); }); qs.set("sort", key); const query = qs.toString(); return `${basePath}${query ? `?${query}` : ""}`; };
  return <div><div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium text-slate-600">Sort:</span>{sorts.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 ${sort === key ? "bg-blue-700 text-white" : "bg-white"}`} href={href(key)} key={key}>{label}</Link>)}</div><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Project</th><th>Member</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th><th>Opportunity</th></tr></thead><tbody>{sortedRows(rows, sort).map((r) => <tr className="border-t" key={r.id}><td className="max-w-xl p-3 break-all"><Link className="text-blue-700" href={`/url/${r.id}`}>{r.url}</Link>{r.warning && <div className="text-xs text-amber-700">{r.warning}</div>}</td><td>{r.project}</td><td>{r.member_name}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{labelText(r.opportunity)}</span></td></tr>)}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={8}>No URLs found for this account.</td></tr>}</tbody></table></div></div>;
}

export function fmtGrowth(n: number | null) { return n === null ? "New growth" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`; }
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string,string> = { growing: "bg-green-100 text-green-800", new_signal: "bg-emerald-100 text-emerald-800", declining: "bg-red-100 text-red-800", stable: "bg-slate-100 text-slate-700", no_data: "bg-amber-100 text-amber-800" };
  const arrow = status === "growing" || status === "new_signal" ? "↗" : status === "declining" ? "↘" : "→";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status] ?? styles.stable}`}>{arrow} {status.replace(/_/g, " ")}</span>;
}
export function RefreshDataButton({ range, startDate, endDate, returnTo, preserve = {} }: { range?: string; startDate?: string; endDate?: string; returnTo?: string; preserve?: Record<string, string | undefined> }) {
  return <form action="/api/refresh" method="post"><input type="hidden" name="range" value={range || "28d"} />{startDate && <input type="hidden" name="startDate" value={startDate} />}{endDate && <input type="hidden" name="endDate" value={endDate} />}{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}{Object.entries(preserve).filter(([k, v]) => v && !["range", "startDate", "endDate"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<button className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Refresh Data</button></form>;
}
