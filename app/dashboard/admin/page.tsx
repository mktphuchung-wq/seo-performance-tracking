import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getComparedPerformance } from "../../../lib/cache";
import { aggregateCompared, type ComparedUrlPerformance } from "../../../lib/growth";
import { getContentUrls } from "../../../lib/google";
import { scoreMembers } from "../../../lib/scoring";
import { DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, MetricCard, RefreshDataButton, Shell, StatusBadge, UrlTable, WarningList } from "../../../components/ui";

function group(rows: ComparedUrlPerformance[], key: keyof Pick<ComparedUrlPerformance, "member_name" | "project">) {
  return Object.entries(rows.reduce<Record<string, ComparedUrlPerformance[]>>((acc, row) => { (acc[String(row[key])] ??= []).push(row); return acc; }, {}));
}

export default async function AdminDashboard({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: import("../../../components/ui").UrlSortKey } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const cached = await getComparedPerformance(await getContentUrls(session.accessToken), session.accessToken, rangeKey, range);
  const performance = cached.rows;
  const summary = aggregateCompared(performance);
  const members = scoreMembers(performance);
  const bestGrowth = [...performance].sort((a,b)=>b.click_delta-a.click_delta).slice(0,10);
  const declining = performance.filter(r=>r.status==="declining").sort((a,b)=>a.click_delta-b.click_delta).slice(0,10);
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Team member performance view</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate} vs {performance[0]?.previousRange.startDate} to {performance[0]?.previousRange.endDate}</p><p className="mt-1 text-sm text-slate-600">Team clicks {summary.click_delta >= 0 ? "increased" : "decreased"} {fmtGrowth(summary.click_growth_pct)} vs previous period. {summary.declining} URLs are declining.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{cached.cacheUsed ? "Using fresh cache" : "Refreshed"}{cached.lastUpdated ? ` · ${cached.lastUpdated}` : ""}</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/admin" preserve={searchParams} /></div></div><DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} preserve={searchParams} /><WarningList warnings={[cached.warning, ...performance.map((p) => p.warning)]} />
  <div className="grid gap-4 md:grid-cols-5"><MetricCard label="Total URLs" value={performance.length}/><MetricCard label="Total Clicks" value={fmtNum(summary.clicks)}/><MetricCard label="Total Impressions" value={fmtNum(summary.impressions)}/><MetricCard label="CTR" value={fmtPct(summary.ctr)}/><MetricCard label="Avg Position" value={fmtPos(summary.position)}/><MetricCard label="Click Growth" value={fmtGrowth(summary.click_growth_pct)}/><MetricCard label="Impression Growth" value={fmtGrowth(summary.impression_growth_pct)}/><MetricCard label="URLs Growing" value={summary.growing}/><MetricCard label="URLs Declining" value={summary.declining}/><MetricCard label="URLs With No Data" value={summary.noData}/></div>
  <h3 className="mb-3 mt-8 text-xl font-semibold">Member Quantity and Quality Index</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Member</th><th>Quantity Index</th><th>Quality Index</th><th>Portfolio health</th><th>Support signal</th><th>URLs</th><th>Priority actions</th><th>Growth</th></tr></thead><tbody>{members.slice(0,8).map(m=><tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/admin/members/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td>{m.quantityIndex}</td><td>{m.qualityIndex}</td><td>{m.portfolioHealth}</td><td>{m.supportSignal}</td><td>{m.urlCount}</td><td>{m.priorityActions}</td><td>{fmtGrowth(m.click_growth_pct)}</td></tr>)}</tbody></table><p className="p-3 text-xs text-slate-500">Indexes are comparative member tracking signals: Quantity reflects portfolio scale, Quality reflects growth and health.</p></div>
  <Section title="Performance by member" rows={group(performance, "member_name")} /><h3 className="mb-3 mt-8 text-xl font-semibold">Best growth URLs</h3><UrlTable rows={bestGrowth} sort={searchParams?.sort || "clicks"} preserve={searchParams} /><h3 className="mb-3 mt-8 text-xl font-semibold">Declining URLs</h3><UrlTable rows={declining} sort={searchParams?.sort || "clicks"} preserve={searchParams} /></Shell>;
}
function Section({ title, rows }: { title: string; rows: [string, ComparedUrlPerformance[]][] }) { return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Name</th><th>URLs</th><th>Clicks</th><th>Prev clicks</th><th>Click growth</th><th>Impr. growth</th><th>Status</th></tr></thead><tbody>{rows.map(([name, list]) => { const m = aggregateCompared(list); const status = m.declining > m.growing ? "declining" : m.growing ? "growing" : "stable"; return <tr className="border-t" key={name}><td className="p-3">{name}</td><td>{list.length}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.previous_clicks)}</td><td>{fmtGrowth(m.click_growth_pct)}</td><td>{fmtGrowth(m.impression_growth_pct)}</td><td><StatusBadge status={status}/></td></tr>; })}</tbody></table></div></div>; }
