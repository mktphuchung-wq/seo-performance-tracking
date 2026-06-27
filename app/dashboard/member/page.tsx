import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getEnvErrors } from "../../../lib/env";
import { aggregate, filterRowsForEmail, getContentUrls, getUrlPerformance } from "../../../lib/google";
import { DateRangePicker, MetricGrid, Shell, UrlTable, WarningList } from "../../../components/ui";

export default async function MemberDashboard({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: import("../../../components/ui").UrlSortKey } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  const range = getDateRange({ range: searchParams?.range, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const allRows = await getContentUrls(session.accessToken);
  const rows = filterRowsForEmail(allRows, session.user.email, session.user.isAdmin);
  const performance = await getUrlPerformance(rows, session.accessToken, range);
  const optimization = performance.filter((r) => ["ctr_opportunity", "ranking_opportunity", "no_data"].includes(r.opportunity));
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-semibold">Member dashboard</h2><span className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</span></div><DateRangePicker range={searchParams?.range || "28d"} startDate={searchParams?.startDate} endDate={searchParams?.endDate} /><WarningList warnings={[...getEnvErrors(), ...performance.map((p) => p.warning)]} /><MetricGrid metrics={aggregate(performance)} count={performance.length} /><h3 className="mb-3 mt-8 text-xl font-semibold">Top URLs</h3><UrlTable rows={[...performance].sort((a, b) => b.clicks - a.clicks).slice(0, 10)} /><h3 className="mb-3 mt-8 text-xl font-semibold">URLs needing optimization</h3><UrlTable rows={optimization} /><h3 className="mb-3 mt-8 text-xl font-semibold">All visible URLs</h3><UrlTable rows={performance} sort={searchParams?.sort || "clicks"} /></Shell>;
}
