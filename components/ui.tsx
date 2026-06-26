import Link from "next/link";
import type { UrlMetrics, UrlPerformance } from "../lib/google";

export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-7xl p-6"><div className="mb-8"><h1 className="text-3xl font-bold">Performance SEO Project - SEO Team</h1><p className="text-slate-600">Google Sheets + Search Console SEO dashboard.</p></div>{children}</main>;
}

export function MetricCard({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

export function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }
export function fmtNum(n: number) { return Math.round(n).toLocaleString(); }
export function fmtPos(n: number) { return n ? n.toFixed(1) : "—"; }

export function MetricGrid({ metrics, count }: { metrics: UrlMetrics; count?: number }) {
  return <div className="grid gap-4 md:grid-cols-5">
    {count !== undefined && <MetricCard label="URL count" value={count} />}
    <MetricCard label="Clicks" value={fmtNum(metrics.clicks)} />
    <MetricCard label="Impressions" value={fmtNum(metrics.impressions)} />
    <MetricCard label="CTR" value={fmtPct(metrics.ctr)} />
    <MetricCard label="Avg. position" value={fmtPos(metrics.position)} />
  </div>;
}

export function UrlTable({ rows }: { rows: UrlPerformance[] }) {
  return <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Project</th><th>Member</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead><tbody>{rows.map((r) => <tr className="border-t" key={r.id}><td className="max-w-xl p-3"><Link href={`/url/${r.id}`}>{r.url}</Link></td><td>{r.project}</td><td>{r.member_name}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td></tr>)}</tbody></table></div>;
}
