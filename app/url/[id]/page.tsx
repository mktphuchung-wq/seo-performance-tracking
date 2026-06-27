import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { filterRowsForEmail } from "../../../lib/google";
import { getUrlDetailFromDb } from "../../../lib/postgres";
import { labelText } from "../../../lib/metrics";
import { fmtNum, fmtPct, fmtPos, MetricGrid, Shell } from "../../../components/ui";
import { TrendChart } from "../../../components/trend-chart";

export default async function UrlDetail({ params, searchParams }: { params: { id: string }; searchParams?: { range?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  const rangeKey = searchParams?.range || "28d";
  const detail = await getUrlDetailFromDb(params.id, rangeKey, getDateRange({ range: rangeKey }));
  if (!detail || !filterRowsForEmail([detail.overview], session.user.email, session.user.isAdmin).length) {
    redirect("/dashboard");
  }
  const selectedRow = detail.overview;
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><a className="text-blue-700" href="/dashboard">← Back</a><h2 className="mt-4 break-all text-2xl font-semibold">{selectedRow.url}</h2><p className="mb-2 text-slate-600">{selectedRow.project} · {selectedRow.member_name} · {detail.overview.gscProperty || "No GSC property"}</p><p className="mb-6 text-sm text-slate-500">{detail.range.label}: {detail.range.startDate} to {detail.range.endDate}</p>{detail.warning && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">{detail.warning}</div>}<MetricGrid metrics={detail.overview} /><div className="mt-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm">URL opportunity: {labelText(detail.overview.opportunity)}</div>{!detail.hasData && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">No Search Console data was returned for this URL in the selected date range.</div>}<h3 className="mb-3 mt-8 text-xl font-semibold">Daily trend</h3><TrendChart data={detail.daily} /><QueryTable title="Query / keyword breakdown" rows={detail.queries} /><QueryTable title="CTR opportunities" rows={detail.ctrOpportunities ?? []} /><QueryTable title="Ranking opportunities" rows={detail.rankingOpportunities ?? []} /><QueryTable title="Winner queries" rows={detail.winningQueries ?? []} /></Shell>;
}

function QueryTable({ title, rows }: { title: string; rows: { query: string; clicks: number; impressions: number; ctr: number; position: number; opportunity: string }[] }) {
  return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos.</th><th>Opportunity</th></tr></thead><tbody>{rows.map((r) => <tr className="border-t" key={r.query}><td className="p-3">{r.query}</td><td>{fmtNum(r.clicks)}</td><td>{fmtNum(r.impressions)}</td><td>{fmtPct(r.ctr)}</td><td>{fmtPos(r.position)}</td><td>{labelText(r.opportunity as never)}</td></tr>)}{rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No rows found.</td></tr>}</tbody></table></div></div>;
}
