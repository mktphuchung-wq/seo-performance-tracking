import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { aggregateCompared } from "../../../lib/growth";
import { getDbPerformance } from "../../../lib/postgres";
import { scoreMembers } from "../../../lib/scoring";
import { DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, MetricSection, RefreshDataButton, Shell, StatusBadge, WarningList } from "../../../components/ui";

function recommendationForMember(member: ReturnType<typeof scoreMembers>[number]) {
  if (member.noData > 0) return "Resolve URLs with no data first.";
  if (member.priorityActions > 0) return "Review declining URLs and assign optimization tasks.";
  if (member.supportSignal === "Strong performer") return "Document and reuse the winning approach.";
  return "Monitor and optimize high-impression URLs.";
}

export default async function AdminMembers({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");

  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const rows = await getDbPerformance(rangeKey, range);
  const members = scoreMembers(rows);
  const summary = aggregateCompared(rows);
  const growthStatus = summary.declining > summary.growing ? "declining" : summary.growing ? "growing" : "stable";
  const supportCounts = members.reduce<Record<string, number>>((acc, member) => {
    acc[member.supportSignal] = (acc[member.supportSignal] || 0) + 1;
    return acc;
  }, {});
  const opportunityStatus = Object.entries(supportCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "No members";

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Admin Member Performance</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Supabase snapshots</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/admin/members" /></div></div>
    <DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} />
    <WarningList warnings={[...rows.map((p) => p.warning)]} />

    <div className="grid gap-6 xl:grid-cols-2">
      <MetricSection title="Quantity Performance" description="Team-wide volume metrics only." tone="quantity" metrics={[
        { label: "Active URLs", value: rows.length },
        { label: "URLs this month", value: rows.length },
        { label: "Current Clicks", value: fmtNum(summary.clicks) },
        { label: "Previous Clicks", value: fmtNum(summary.previous_clicks) },
        { label: "Current Impressions", value: fmtNum(summary.impressions) },
        { label: "Previous Impressions", value: fmtNum(summary.previous_impressions) },
        { label: "Click Delta", value: fmtNum(summary.click_delta) },
        { label: "Impression Delta", value: fmtNum(summary.impression_delta) },
      ]} />
      <MetricSection title="Quality Performance" description="Team-wide quality, health, and support signals." tone="quality" metrics={[
        { label: "Click Growth %", value: fmtGrowth(summary.click_growth_pct) },
        { label: "Impression Growth %", value: fmtGrowth(summary.impression_growth_pct) },
        { label: "CTR", value: fmtPct(summary.ctr) },
        { label: "Avg Position", value: fmtPos(summary.position) },
        { label: "Growth Status", value: <StatusBadge status={growthStatus} /> },
        { label: "Opportunity Status", value: opportunityStatus },
        { label: "Recommendation", value: <span className="text-base font-medium leading-snug">{summary.declining ? "Prioritize members with declining URLs." : "Monitor member quality trends."}</span> },
      ]} />
    </div>

    <h3 className="mb-3 mt-8 text-xl font-semibold">Member comparison matrix</h3>
    <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3" rowSpan={2}>Member</th><th className="border-l px-3 py-2 text-blue-950" colSpan={8}>Quantity Performance</th><th className="border-l px-3 py-2 text-emerald-950" colSpan={7}>Quality Performance</th></tr><tr><th className="border-l px-3 py-2">Active URLs</th><th>URLs this month</th><th>Current Clicks</th><th>Previous Clicks</th><th>Current Impressions</th><th>Previous Impressions</th><th>Click Delta</th><th>Impression Delta</th><th className="border-l px-3 py-2">Click Growth %</th><th>Impression Growth %</th><th>CTR</th><th>Avg Position</th><th>Growth Status</th><th>Opportunity Status</th><th>Recommendation</th></tr></thead><tbody>{members.map((m) => { const status = m.portfolioHealth === "At risk" ? "declining" : m.portfolioHealth === "Healthy growth" ? "growing" : "stable"; return <tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td className="border-l px-3 py-2">{m.urlCount}</td><td>{m.urlCount}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.previous_clicks)}</td><td>{fmtNum(m.impressions)}</td><td>{fmtNum(m.previous_impressions)}</td><td>{fmtNum(m.click_delta)}</td><td>{fmtNum(m.impression_delta)}</td><td className="border-l px-3 py-2">{fmtGrowth(m.click_growth_pct)}</td><td>{fmtGrowth(m.impression_growth_pct)}</td><td>{fmtPct(m.ctr)}</td><td>{fmtPos(m.position)}</td><td><StatusBadge status={status}/></td><td>{m.supportSignal}</td><td>{recommendationForMember(m)}</td></tr>; })}</tbody></table></div>
  </Shell>;
}
