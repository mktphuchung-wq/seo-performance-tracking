import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { getDateRange } from "../../lib/dates";
import { aggregateCompared, type ComparedUrlPerformance } from "../../lib/growth";
import { filterRowsForEmail } from "../../lib/google";
import { getDbContentUrls, getDbPerformance, getMemberPerformanceFinalByMember } from "../../lib/postgres";
import { fmtGrowth, fmtNum, fmtPct, fmtPos, DataTableContainer, MetricSection, PerformanceKpiPanel, RefreshDataButton, SectionGrid, Shell, StatusBadge, WarningList } from "../../components/ui";
import { getGrowthClassName } from "../../lib/format";

const insightRanges = [
  ["current_month", "Current month"],
  ["previous_month", "Previous month"],
  ["last_3_months", "Last 3 months"],
  ["last_6_months", "Last 6 months"],
  ["all_time", "All time"],
] as const;

type InsightRangeKey = typeof insightRanges[number][0];
type SearchParams = { member?: string; range?: string; refreshError?: string };

function getInsightRange(rangeKey: InsightRangeKey) {
  return getDateRange({ range: rangeKey });
}

function cleanParams(params: SearchParams, overrides: Partial<SearchParams> = {}) {
  const query = new URLSearchParams();
  Object.entries({ ...params, ...overrides }).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return `?${query.toString()}`;
}

function sortByGrowth(rows: ComparedUrlPerformance[], direction: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    const left = a.click_growth_pct ?? (a.clicks > 0 ? Number.POSITIVE_INFINITY : 0);
    const right = b.click_growth_pct ?? (b.clicks > 0 ? Number.POSITIVE_INFINITY : 0);
    return direction === "desc" ? right - left || b.click_delta - a.click_delta : left - right || a.click_delta - b.click_delta;
  });
}

function Section({ title, description, rows }: { title: string; description?: string; rows: ComparedUrlPerformance[] }) {
  return <section className="mt-8">
    <div className="mb-3"><h3 className="text-xl font-semibold">{title}</h3>{description && <p className="text-sm text-slate-500">{description}</p>}</div>
    <DataTableContainer>
      <table className="w-full min-w-[1080px] text-[13px] sm:text-sm">
        <thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Project</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th><th>Click growth</th><th>Impr. growth</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr className="border-t" key={row.id}><td className="w-[34rem] max-w-[34rem] p-3"><Link className="block truncate text-blue-700" title={row.url} href={`/url/${row.id}`}>{row.url}</Link></td><td>{row.project}</td><td>{fmtNum(row.clicks)}</td><td>{fmtNum(row.impressions)}</td><td>{fmtPct(row.ctr)}</td><td>{fmtPos(row.position)}</td><td><span className={getGrowthClassName(row.click_growth_pct)}>{fmtGrowth(row.click_growth_pct)}</span></td><td><span className={getGrowthClassName(row.impression_growth_pct)}>{fmtGrowth(row.impression_growth_pct)}</span></td><td><StatusBadge status={row.status} /></td></tr>)}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={9}>No URLs match this section.</td></tr>}</tbody>
      </table>
    </DataTableContainer>
  </section>;
}

export default async function MemberInsights({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");

  const params = searchParams || {};
  const rangeKey = (insightRanges.some(([key]) => key === params.range) ? params.range : "current_month") as InsightRangeKey;
  const range = getInsightRange(rangeKey);
  const [activeUrls, rows] = await Promise.all([getDbContentUrls(), getDbPerformance(rangeKey, range)]);
  const visibleUrls = session.user.isAdmin ? activeUrls : filterRowsForEmail(activeUrls, session.user.email, false);
  const memberOptions = Array.from(new Set(visibleUrls.map((row) => row.member_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const requestedMember = params.member ? decodeURIComponent(params.member) : "";
  const selectedMember = session.user.isAdmin ? (memberOptions.includes(requestedMember) ? requestedMember : "") : memberOptions[0] || "";

  if (!session.user.isAdmin && requestedMember && requestedMember !== selectedMember) redirect(`/member-insights?${new URLSearchParams({ range: rangeKey }).toString()}`);

  const visibleRows = session.user.isAdmin ? rows : filterRowsForEmail(rows, session.user.email, false);
  const memberRows = selectedMember ? visibleRows.filter((row) => row.member_name === selectedMember) : [];
  const summary = aggregateCompared(memberRows);
  const finalPerformance = selectedMember ? await getMemberPerformanceFinalByMember(selectedMember).catch(() => null) : null;
  const topGrowing = sortByGrowth(memberRows.filter((row) => row.status === "growing" || row.status === "new_signal"), "desc").slice(0, 10);
  const topDeclining = sortByGrowth(memberRows.filter((row) => row.status === "declining"), "asc").slice(0, 10);
  const highImpressionLowCtr = [...memberRows].filter((row) => row.impressions >= 100 && row.ctr < 0.01).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const noData = memberRows.filter((row) => row.status === "no_data");

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-2xl font-semibold">Member Insights</h2><p className="text-sm text-slate-500">Select one member and one range to review portfolio performance. {range.label}: {range.startDate} to {range.endDate}</p></div>{session.user.isAdmin && <RefreshDataButton range={rangeKey} returnTo="/member-insights" preserve={{ member: selectedMember }} />}</div>
    <WarningList warnings={[params.refreshError, ...memberRows.map((row) => row.warning)]} />

    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <form className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="w-full min-w-64 text-sm text-slate-600 lg:max-w-md">Member<select className="mt-1 w-full rounded-lg border px-3 py-2.5" name="member" defaultValue={selectedMember} disabled={!session.user.isAdmin}><option value="">Select a member</option>{memberOptions.map((member) => <option key={member} value={member}>{member}</option>)}</select></label>
        <input type="hidden" name="range" value={rangeKey} />
        {session.user.isAdmin && <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" type="submit">View member</button>}
      </form>
      <div className="mt-4 flex flex-wrap gap-2">{insightRanges.map(([key, label]) => <Link className={`rounded-full border px-3 py-1 text-sm ${rangeKey === key ? "bg-blue-700 text-white" : "bg-white text-slate-700"}`} href={cleanParams({ member: selectedMember, range: rangeKey }, { range: key })} key={key}>{label}</Link>)}</div>
    </section>

    {!selectedMember ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">Choose a member to load insights. All members are intentionally hidden until a member is selected.</div> : <>
      <SectionGrid>
        <PerformanceKpiPanel finalPerformance={finalPerformance} memberName={selectedMember} />
        <MetricSection title="KPI overview" description={`Portfolio metrics for ${selectedMember}.`} metrics={[{ label: "Active URLs", value: memberRows.length }, { label: "URLs With Data", value: memberRows.length - summary.noData }, { label: "Current Clicks", value: fmtNum(summary.clicks) }, { label: "Previous Clicks", value: fmtNum(summary.previous_clicks) }, { label: "Current Impressions", value: fmtNum(summary.impressions) }, { label: "Previous Impressions", value: fmtNum(summary.previous_impressions) }, { label: "CTR", value: fmtPct(summary.ctr) }, { label: "Avg Position", value: fmtPos(summary.position) }]} />
        <MetricSection title="Trend summary" description="Growth and health signals for the selected range." tone="quality" metrics={[{ label: "Click Growth %", value: <span className={getGrowthClassName(summary.click_growth_pct)}>{fmtGrowth(summary.click_growth_pct)}</span> }, { label: "Impression Growth %", value: <span className={getGrowthClassName(summary.impression_growth_pct)}>{fmtGrowth(summary.impression_growth_pct)}</span> }, { label: "Growing URLs", value: summary.growing }, { label: "Declining URLs", value: summary.declining }, { label: "No Data URLs", value: summary.noData }]} />
      </SectionGrid>
      <Section title="URL portfolio table" rows={memberRows} />
      <Section title="Top growing URLs" rows={topGrowing} />
      <Section title="Top declining URLs" rows={topDeclining} />
      <Section title="High impressions but low CTR URLs" description="URLs with at least 100 impressions and CTR below 1%." rows={highImpressionLowCtr} />
      <Section title="Not enough data to evaluate URLs" rows={noData} />
    </>}
  </Shell>;
}
