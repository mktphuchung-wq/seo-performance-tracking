import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getContentUrls } from "../../../lib/google";
import { getComparedPerformance } from "../../../lib/cache";
import { scoreMembers } from "../../../lib/scoring";
import { DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, RefreshDataButton, Shell, StatusBadge, WarningList } from "../../../components/ui";

export default async function Members({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const cached = await getComparedPerformance(await getContentUrls(session.accessToken), session.accessToken, rangeKey, range);
  const members = scoreMembers(cached.rows);
  const priority = members.filter((m) => m.priorityActions > 0 || m.supportSignal !== "Stable").slice(0, 8);
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Member performance tracking</h2><p className="text-sm text-slate-500">Quantity Index measures portfolio scale. Quality Index measures growth, health, and optimization signals.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{cached.cacheUsed ? "Using fresh cache" : "Refreshed"}{cached.lastUpdated ? ` · ${cached.lastUpdated}` : ""}</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/admin/members" /></div></div>
    <DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} />
    <WarningList warnings={[cached.warning, ...cached.rows.map((p) => p.warning)]} />
    <h3 className="mb-3 mt-8 text-xl font-semibold">Priority action list</h3><div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Member</th><th>Portfolio health</th><th>Priority URLs</th><th>Support signal</th><th>Declining</th><th>No data</th><th>Quality Index</th></tr></thead><tbody>{priority.map((m) => <tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/admin/members/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td>{m.portfolioHealth}</td><td>{m.priorityActions}</td><td>{m.supportSignal}</td><td>{m.declining}</td><td>{m.noData}</td><td>{m.qualityIndex}</td></tr>)}</tbody></table></div>
    <h3 className="mb-3 mt-8 text-xl font-semibold">Member comparison matrix</h3><div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Member</th><th>Portfolio Health</th><th>URL Count</th><th>Quantity Index</th><th>Quality Index</th><th>Current Clicks</th><th>Previous Clicks</th><th>Click Growth %</th><th>Current Impressions</th><th>Previous Impressions</th><th>Impression Growth %</th><th>CTR</th><th>Avg Position</th><th>Growing URLs</th><th>Declining URLs</th><th>No Data URLs</th><th>Priority Actions</th><th>Support Signal</th></tr></thead><tbody>{members.map((m) => { const status = m.portfolioHealth === "At risk" ? "declining" : m.portfolioHealth === "Healthy growth" ? "growing" : "stable"; return <tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/admin/members/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td><StatusBadge status={status}/><span className="ml-2">{m.portfolioHealth}</span></td><td>{m.urlCount}</td><td>{m.quantityIndex}</td><td>{m.qualityIndex}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.previous_clicks)}</td><td>{fmtGrowth(m.click_growth_pct)}</td><td>{fmtNum(m.impressions)}</td><td>{fmtNum(m.previous_impressions)}</td><td>{fmtGrowth(m.impression_growth_pct)}</td><td>{fmtPct(m.ctr)}</td><td>{fmtPos(m.position)}</td><td>{m.growing}</td><td>{m.declining}</td><td>{m.noData}</td><td>{m.priorityActions}</td><td>{m.supportSignal}</td></tr>; })}</tbody></table></div>
  </Shell>;
}
