import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { aggregateCompared } from "../../../lib/growth";
import { getDbPerformance } from "../../../lib/postgres";
import { scoreMembers } from "../../../lib/scoring";
import { DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, MetricSection, RefreshDataButton, Shell, WarningList } from "../../../components/ui";

export default async function AdminMembers({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");

  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const rows = await getDbPerformance(rangeKey, range);
  const members = scoreMembers(rows);
  const summary = aggregateCompared(rows);
  const urlsWithData = rows.length - summary.noData;

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">SEO Team Performance</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Supabase snapshots</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/admin/members" /></div></div>
    <DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} />
    <WarningList warnings={[...rows.map((p) => p.warning)]} />

    <div className="grid gap-6 xl:grid-cols-2">
      <MetricSection title="Quantity Performance" description="Team-wide volume metrics from cached performance rows." tone="quantity" metrics={[
        { label: "Active URLs", value: rows.length },
        { label: "URLs this month", value: rows.length },
        { label: "URLs With Data", value: urlsWithData },
        { label: "Current Clicks", value: fmtNum(summary.clicks) },
        { label: "Previous Clicks", value: fmtNum(summary.previous_clicks) },
        { label: "Current Impressions", value: fmtNum(summary.impressions) },
        { label: "Previous Impressions", value: fmtNum(summary.previous_impressions) },
      ]} />
      <MetricSection title="Quality Performance" description="Team-wide quality, growth, and support signals from cached performance rows." tone="quality" metrics={[
        { label: "Click Growth %", value: fmtGrowth(summary.click_growth_pct) },
        { label: "Impression Growth %", value: fmtGrowth(summary.impression_growth_pct) },
        { label: "CTR", value: fmtPct(summary.ctr) },
        { label: "Avg Position", value: fmtPos(summary.position) },
        { label: "Growing URLs", value: summary.growing },
        { label: "Declining URLs", value: summary.declining },
        { label: "No Data URLs", value: summary.noData },
      ]} />
    </div>

    <section className="mt-8">
      <h3 className="mb-3 text-xl font-semibold">Quantity Performance</h3>
      <div className="overflow-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-blue-50 text-left text-blue-950">
            <tr>
              <th className="p-3">Member</th>
              <th>Active URLs</th>
              <th>URLs This Month</th>
              <th>URLs With Data</th>
              <th>Current Clicks</th>
              <th>Previous Clicks</th>
              <th>Current Impressions</th>
              <th>Previous Impressions</th>
              <th>Quantity Index</th>
            </tr>
          </thead>
          <tbody>{members.map((m) => <tr className="border-t" key={m.member_name}>
            <td className="p-3"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td>
            <td>{m.activeUrls}</td>
            <td>{m.urlsThisMonth}</td>
            <td>{m.urlsWithData}</td>
            <td>{fmtNum(m.clicks)}</td>
            <td>{fmtNum(m.previous_clicks)}</td>
            <td>{fmtNum(m.impressions)}</td>
            <td>{fmtNum(m.previous_impressions)}</td>
            <td>{m.quantityIndex}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="mt-8">
      <h3 className="mb-3 text-xl font-semibold">Quality Performance</h3>
      <div className="overflow-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-emerald-50 text-left text-emerald-950">
            <tr>
              <th className="p-3">Member</th>
              <th>Click Growth %</th>
              <th>Impression Growth %</th>
              <th>CTR</th>
              <th>Avg Position</th>
              <th>Growing URLs</th>
              <th>Declining URLs</th>
              <th>No Data URLs</th>
              <th>Quality Index</th>
              <th>Support Signal</th>
            </tr>
          </thead>
          <tbody>{members.map((m) => <tr className="border-t" key={m.member_name}>
            <td className="p-3"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td>
            <td>{fmtGrowth(m.click_growth_pct)}</td>
            <td>{fmtGrowth(m.impression_growth_pct)}</td>
            <td>{fmtPct(m.ctr)}</td>
            <td>{fmtPos(m.position)}</td>
            <td>{m.growing}</td>
            <td>{m.declining}</td>
            <td>{m.noData}</td>
            <td>{m.qualityIndex}</td>
            <td>{m.supportSignal}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </Shell>;
}
