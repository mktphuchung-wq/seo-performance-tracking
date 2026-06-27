import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getContentUrls } from "../../../lib/google";
import { getComparedPerformance } from "../../../lib/cache";
import { scoreMembers } from "../../../lib/scoring";
import { DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, Shell } from "../../../components/ui";
export default async function Members({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string } }) {
 const session=await getServerSession(authOptions); if(!session?.user?.email||!session.accessToken) redirect("/"); if(!session.user.isAdmin) redirect("/dashboard");
 const rangeKey=searchParams?.range||"28d"; const range=getDateRange({range:rangeKey,startDate:searchParams?.startDate,endDate:searchParams?.endDate});
 const {rows}=await getComparedPerformance(await getContentUrls(session.accessToken),session.accessToken,rangeKey,range); const members=scoreMembers(rows);
 return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><h2 className="mb-2 text-2xl font-semibold">Member ranking</h2><p className="mb-4 text-sm text-slate-500">Performance score is an internal comparative score, not an absolute SEO quality score.</p><DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate}/><div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Member</th><th>URL Count</th><th>Current Clicks</th><th>Previous Clicks</th><th>Click Growth %</th><th>Current Impressions</th><th>Previous Impressions</th><th>Impression Growth %</th><th>CTR</th><th>Avg Position</th><th>Growing URLs</th><th>Declining URLs</th><th>No Data URLs</th><th>Performance Score</th><th>Support Signal</th></tr></thead><tbody>{members.map(m=><tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/admin/members/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td>{m.urlCount}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.previous_clicks)}</td><td>{fmtGrowth(m.click_growth_pct)}</td><td>{fmtNum(m.impressions)}</td><td>{fmtNum(m.previous_impressions)}</td><td>{fmtGrowth(m.impression_growth_pct)}</td><td>{fmtPct(m.ctr)}</td><td>{fmtPos(m.position)}</td><td>{m.growing}</td><td>{m.declining}</td><td>{m.noData}</td><td>{m.score}</td><td>{m.supportSignal}</td></tr>)}</tbody></table></div></Shell>
}
