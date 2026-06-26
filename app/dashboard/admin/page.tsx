import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { aggregate, getContentUrls, getUrlPerformance, type UrlPerformance } from "../../../lib/google";
import { fmtNum, fmtPct, fmtPos, MetricGrid, Shell, UrlTable } from "../../../components/ui";

function group(rows: UrlPerformance[], key: keyof Pick<UrlPerformance, "member_name" | "project">) {
  return Object.entries(rows.reduce<Record<string, UrlPerformance[]>>((acc, row) => { (acc[String(row[key])] ??= []).push(row); return acc; }, {}));
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard/member");
  const performance = await getUrlPerformance(await getContentUrls(session.accessToken), session.accessToken);
  const needingOptimization = performance.filter((r) => r.impressions > 100 && (r.ctr < 0.02 || r.position > 10)).sort((a, b) => b.impressions - a.impressions);
  return <Shell><h2 className="mb-6 text-2xl font-semibold">Admin dashboard</h2><MetricGrid metrics={aggregate(performance)} count={performance.length} />
    <Section title="Metrics by member" rows={group(performance, "member_name")} />
    <Section title="Metrics by project" rows={group(performance, "project")} />
    <h3 className="mb-3 mt-8 text-xl font-semibold">Top URLs</h3><UrlTable rows={[...performance].sort((a, b) => b.clicks - a.clicks).slice(0, 20)} />
    <h3 className="mb-3 mt-8 text-xl font-semibold">URLs needing optimization</h3><UrlTable rows={needingOptimization.slice(0, 50)} /></Shell>;
}

function Section({ title, rows }: { title: string; rows: [string, UrlPerformance[]][] }) {
  return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Name</th><th>URLs</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead><tbody>{rows.map(([name, list]) => { const m = aggregate(list); return <tr className="border-t" key={name}><td className="p-3">{name}</td><td>{list.length}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.impressions)}</td><td>{fmtPct(m.ctr)}</td><td>{fmtPos(m.position)}</td></tr>; })}</tbody></table></div></div>;
}
