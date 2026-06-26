import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { filterRowsForEmail, getContentUrls, getUrlDetail } from "../../../lib/google";
import { fmtNum, fmtPct, fmtPos, MetricGrid, Shell } from "../../../components/ui";
import { TrendChart } from "../../../components/trend-chart";

export default async function UrlDetail({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  const rows = filterRowsForEmail(await getContentUrls(session.accessToken), session.user.email, session.user.isAdmin);
  const row = rows.find((item) => item.id === params.id);
  if (!row) redirect("/dashboard/member");
  const detail = await getUrlDetail(row, session.accessToken);
  return <Shell><a href="/dashboard/member">← Back</a><h2 className="mt-4 text-2xl font-semibold break-all">{row.url}</h2><p className="mb-6 text-slate-600">{row.project} · {row.member_name}</p><MetricGrid metrics={detail.overview} />
    {!detail.hasData && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">No Search Console data was returned for this URL in the selected date range.</div>}
    <h3 className="mb-3 mt-8 text-xl font-semibold">Daily trend</h3><TrendChart data={detail.daily} />
    <QueryTable title="Query / keyword breakdown" rows={detail.queries} />
    <QueryTable title="CTR opportunities" rows={detail.ctrOpportunities ?? []} />
    <QueryTable title="Ranking opportunities" rows={detail.rankingOpportunities ?? []} />
    <QueryTable title="Top winning queries" rows={detail.winningQueries ?? []} />
  </Shell>;
}

function QueryTable({ title, rows }: { title: string; rows: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] }) {
  return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th></tr></thead><tbody>{rows.map((r) => <tr className="border-t" key={r.query}><td className="p-3">{r.query}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td></tr>)}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={5}>No rows found.</td></tr>}</tbody></table></div></div>;
}
