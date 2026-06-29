import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getEnvErrors } from "../../../lib/env";
import { filterRowsForEmail } from "../../../lib/google";
import { getDbPerformance } from "../../../lib/postgres";
import { aggregateCompared } from "../../../lib/growth";
import { DateRangePicker, fmtGrowth, MetricCard, RefreshDataButton, Shell, UrlTable, WarningList } from "../../../components/ui";
import Link from "next/link";

export default async function MemberDashboard({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: import("../../../components/ui").UrlSortKey; direction?: import("../../../components/ui").UrlSortDirection } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const performance = filterRowsForEmail(await getDbPerformance(rangeKey, range), session.user.email, session.user.isAdmin);
  const summary = aggregateCompared(performance);
  const optimization = performance.filter((r) => r.status === "declining" || r.status === "no_data");
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-semibold">Member dashboard</h2><span className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</span></div><div className="mb-4 flex justify-end"><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/dashboard" preserve={searchParams} /></div><DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} preserve={searchParams} /><WarningList warnings={[...getEnvErrors(), ...performance.map((p) => p.warning)]} /><div className="grid gap-4 md:grid-cols-5"><MetricCard label="URL count" value={performance.length}/><MetricCard label="Clicks" value={summary.clicks}/><MetricCard label="Click growth" value={fmtGrowth(summary.click_growth_pct)}/><MetricCard label="URLs growing" value={summary.growing}/><MetricCard label="URLs declining" value={summary.declining}/></div><p className="mt-4"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(performance[0]?.member_name || "")}`}>Open my 1m/3m/6m detail page</Link></p><h3 className="mb-3 mt-8 text-xl font-semibold">Top URLs</h3><UrlTable rows={[...performance].sort((a, b) => b.clicks - a.clicks).slice(0, 10)} /><h3 className="mb-3 mt-8 text-xl font-semibold">URLs needing optimization</h3><UrlTable rows={optimization} /><h3 className="mb-3 mt-8 text-xl font-semibold">All visible URLs</h3><UrlTable rows={performance} sort={searchParams?.sort || "clicks"} preserve={searchParams} /></Shell>;
}
