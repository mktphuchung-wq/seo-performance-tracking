import Link from "next/link";
import type { UrlMetrics, UrlPerformance } from "../lib/google";
import { labelText } from "../lib/metrics";

export function Shell({ children, email, isAdmin }: { children: React.ReactNode; email?: string | null; isAdmin?: boolean }) {
  return <main className="mx-auto max-w-7xl p-6"><div className="mb-8 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-bold">Performance SEO Project - SEO Team</h1><p className="text-slate-600">Google Sheets + Search Console SEO dashboard.</p></div><div className="flex flex-wrap gap-3 text-sm"><Link href="/dashboard">Dashboard</Link>{isAdmin && <><Link href="/admin">Admin</Link><Link href="/admin/urls">URLs</Link><Link href="/admin/members">Members</Link><Link href="/admin/projects">Projects</Link></>}<span className="text-slate-500">{email}</span>{email && <a href="/api/auth/signout">Sign out</a>}</div></div>{children}</main>;
}

export function DateRangePicker({ range = "28d" }: { range?: string }) {
  const items = [["28d", "Last 28 days"], ["3m", "Last 3 months"], ["6m", "Last 6 months"], ["12m", "Last 12 months"], ["all", "All time"]];
  return <div className="mb-6 flex flex-wrap gap-2">{items.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 text-sm ${range === key ? "bg-blue-700 text-white" : "bg-white"}`} href={`?range=${key}`} key={key}>{label}</Link>)}</div>;
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

export function UrlTable({ rows }: { rows: UrlPerformance[] }) {
  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
  return <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Project</th><th>Member</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th><th>Opportunity</th></tr></thead><tbody>{sorted.map((r) => <tr className="border-t" key={r.id}><td className="max-w-xl p-3 break-all"><Link className="text-blue-700" href={`/url/${r.id}`}>{r.url}</Link>{r.warning && <div className="text-xs text-amber-700">{r.warning}</div>}</td><td>{r.project}</td><td>{r.member_name}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{labelText(r.opportunity)}</span></td></tr>)}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={8}>No URLs found for this account.</td></tr>}</tbody></table></div>;
}
