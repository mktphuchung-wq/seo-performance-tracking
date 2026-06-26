import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { aggregate, getContentUrls, getUrlPerformance, type UrlPerformance } from "../../../lib/google";
import { DateRangePicker, fmtNum, fmtPct, fmtPos, MetricGrid, Shell, UrlTable, WarningList } from "../../../components/ui";

function group(rows: UrlPerformance[], key: keyof Pick<UrlPerformance, "member_name" | "project">) {
  return Object.entries(rows.reduce<Record<string, UrlPerformance[]>>((acc, row) => { (acc[String(row[key])] ??= []).push(row); return acc; }, {}));
}

export default async function AdminDashboard({ searchParams }: { searchParams?: { range?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  const range = getDateRange({ range: searchParams?.range });
  const performance = await getUrlPerformance(await getContentUrls(session.accessToken), session.accessToken, range);
  const needingOptimization = performance.filter((r) => ["ctr_opportunity", "ranking_opportunity", "no_data"].includes(r.opportunity)).sort((a, b) => b.impressions - a.impressions);
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><h2 className="mb-2 text-2xl font-semibold">Admin dashboard</h2><p className="mb-4 text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate}</p><DateRangePicker range={searchParams?.range || "28d"} /><WarningList warnings={performance.map((p) => p.warning)} /><MetricGrid metrics={aggregate(performance)} count={performance.length} /><Section title="Performance by member" rows={group(performance, "member_name")} /><Section title="Performance by project" rows={group(performance, "project")} /><h3 className="mb-3 mt-8 text-xl font-semibold">Top URLs</h3><UrlTable rows={[...performance].sort((a, b) => b.clicks - a.clicks).slice(0, 20)} /><h3 className="mb-3 mt-8 text-xl font-semibold">URLs needing optimization</h3><UrlTable rows={needingOptimization.slice(0, 50)} /></Shell>;
}

function Section({ title, rows }: { title: string; rows: [string, UrlPerformance[]][] }) {
  return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Name</th><th>URLs</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead><tbody>{rows.map(([name, list]) => { const m = aggregate(list); return <tr className="border-t" key={name}><td className="p-3">{name}</td><td>{list.length}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.impressions)}</td><td>{fmtPct(m.ctr)}</td><td>{fmtPos(m.position)}</td></tr>; })}</tbody></table></div></div>;
}
