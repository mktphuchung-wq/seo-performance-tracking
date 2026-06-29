import Link from "next/link";
import { getServerSession } from "next-auth";
import { AdminDataControls } from "../../../components/admin-controls";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange, normalizeDateRangeKey } from "../../../lib/dates";
import { aggregateCompared, type ComparedUrlPerformance } from "../../../lib/growth";
import { getAdminDiagnostics, getAdminMemberRows, getDbPerformance } from "../../../lib/postgres";
import { DataTableContainer, DateRangePicker, fmtGrowth, fmtNum, fmtPct, fmtPos, MetricCard, MetricSection, SectionGrid, Shell, StatusBadge, UrlTable, WarningList, type MetricTone } from "../../../components/ui";
import { formatSignedNumber, getGrowthClassName } from "../../../lib/format";

function group(rows: ComparedUrlPerformance[], key: keyof Pick<ComparedUrlPerformance, "member_name" | "project">) {
  return Object.entries(rows.reduce<Record<string, ComparedUrlPerformance[]>>((acc, row) => { (acc[String(row[key])] ??= []).push(row); return acc; }, {}));
}

function growthMetricTone(value: number | null): MetricTone {
  if (value === null || value === 0) return "growth-neutral";
  return value > 0 ? "growth-positive" : "growth-negative";
}

export default async function AdminDashboard({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: import("../../../components/ui").UrlSortKey; direction?: import("../../../components/ui").UrlSortDirection; refreshError?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email ) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  const rangeKey = normalizeDateRangeKey(searchParams?.range);
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const performance = await getDbPerformance(rangeKey, range);
  const summary = aggregateCompared(performance);
  const [members, diagnostics] = await Promise.all([getAdminMemberRows(rangeKey, range, performance), getAdminDiagnostics()]);
  const bestGrowth = [...performance].sort((a,b)=>b.click_delta-a.click_delta).slice(0,10);
  const declining = performance.filter(r=>r.status==="declining").sort((a,b)=>a.click_delta-b.click_delta).slice(0,10);
  const selectedRangeLabel = range.label;
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Team member performance view</h2><p className="text-sm text-slate-500">{range.label}: {range.startDate} to {range.endDate} vs {performance[0]?.previousRange.startDate} to {performance[0]?.previousRange.endDate}</p><p className="mt-1 text-sm text-slate-600">Team clicks {summary.click_delta >= 0 ? "increased" : "decreased"} {fmtGrowth(summary.click_growth_pct)} vs previous period. {summary.declining} URLs are declining.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Performance cache</span></div></div>{searchParams?.refreshError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{searchParams.refreshError}</div>}<AdminDataControls range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} /><DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} preserve={searchParams} /><WarningList warnings={[...performance.map((p) => p.warning), diagnostics.missingMemberEmail ? "Some members are missing email mapping. Check MEMBER_EMAIL_MAP." : undefined, diagnostics.missingGscProperty ? "Some projects are missing GSC mapping. Check PROJECT_GSC_MAP." : undefined]} />
  <SectionGrid>
    <MetricSection title={`SEO Team Performance Tháng ${selectedRangeLabel}`} description="Volume-only metrics for the selected range." tone="quantity" metrics={[{ label: "Total URLs", value: performance.length }, { label: "Current Clicks", value: fmtNum(summary.clicks) }, { label: "Previous Clicks", value: fmtNum(summary.previous_clicks) }, { label: "Click Delta", value: formatSignedNumber(summary.click_delta), tone: growthMetricTone(summary.click_delta) }, { label: "Current Impressions", value: fmtNum(summary.impressions) }, { label: "Previous Impressions", value: fmtNum(summary.previous_impressions) }, { label: "Impression Delta", value: formatSignedNumber(summary.impression_delta), tone: growthMetricTone(summary.impression_delta) }, { label: "URLs With No Data", value: summary.noData }]} />
    <MetricSection title="SEO Performance Growth" description="Growth and efficiency metrics for the selected range." tone="quality" metrics={[{ label: "Click Growth %", value: fmtGrowth(summary.click_growth_pct), tone: growthMetricTone(summary.click_growth_pct) }, { label: "Impression Growth %", value: fmtGrowth(summary.impression_growth_pct), tone: growthMetricTone(summary.impression_growth_pct) }, { label: "CTR", value: fmtPct(summary.ctr), tone: "growth-neutral" }, { label: "Avg Position", value: fmtPos(summary.position), tone: "growth-neutral" }, { label: "URLs Growing", value: summary.growing, tone: "growth-positive" }, { label: "URLs Declining", value: summary.declining, tone: summary.declining > 0 ? "growth-negative" : "growth-neutral" }]} />
  </SectionGrid>
  <Section title="Member Summary Table" rows={group(performance, "member_name")} />
  <Diagnostics diagnostics={diagnostics} /><h3 className="mb-3 mt-8 text-xl font-semibold">SEO Team Performance</h3><SectionGrid><MemberIndexSection title={`SEO Team Performance Tháng ${selectedRangeLabel}`} members={members} mode="quantity" /><MemberIndexSection title="SEO Performance Growth" members={members} mode="quality" /></SectionGrid>
  <h3 className="mb-3 mt-8 text-xl font-semibold">Best growth URLs</h3><UrlTable rows={bestGrowth} sort={searchParams?.sort || "clicks"} preserve={searchParams} /><h3 className="mb-3 mt-8 text-xl font-semibold">Declining URLs</h3><UrlTable rows={declining} sort={searchParams?.sort || "clicks"} preserve={searchParams} /></Shell>;
}
function Section({ title, rows }: { title: string; rows: [string, ComparedUrlPerformance[]][] }) { return <div className="mt-8"><h3 className="mb-3 text-xl font-semibold">{title}</h3><DataTableContainer><table className="w-full min-w-[900px] text-[13px] sm:text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Name</th><th>URLs</th><th>Clicks</th><th>Prev clicks</th><th>Click growth</th><th>Impr. growth</th><th>Status</th></tr></thead><tbody>{rows.map(([name, list]) => { const m = aggregateCompared(list); const status = m.declining > m.growing ? "declining" : m.growing ? "growing" : "stable"; return <tr className="border-t" key={name}><td className="p-3">{name}</td><td>{list.length}</td><td>{fmtNum(m.clicks)}</td><td>{fmtNum(m.previous_clicks)}</td><td><span className={getGrowthClassName(m.click_growth_pct)}>{fmtGrowth(m.click_growth_pct)}</span></td><td><span className={getGrowthClassName(m.impression_growth_pct)}>{fmtGrowth(m.impression_growth_pct)}</span></td><td><StatusBadge status={status}/></td></tr>; })}</tbody></table></DataTableContainer></div>; }

function Diagnostics({ diagnostics }: { diagnostics: Awaited<ReturnType<typeof getAdminDiagnostics>> }) {
  return <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="mb-3 text-lg font-semibold">Admin diagnostics</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="Active URLs" value={diagnostics.activeUrls} /><MetricCard label="URLs missing member_email" value={diagnostics.missingMemberEmail} /><MetricCard label="URLs missing gsc_property" value={diagnostics.missingGscProperty} /></div><div className="mt-4 grid gap-4 text-sm md:grid-cols-2"><div><div className="font-medium">Latest sync_runs status</div><div className="text-slate-600">{diagnostics.latestSyncRun ? `${diagnostics.latestSyncRun.status} (${String(diagnostics.latestSyncRun.created_at).slice(0,19)})` : "No sync runs yet"}</div></div><div><div className="font-medium">Latest refresh_runs status</div><div className="text-slate-600">{diagnostics.latestRefreshRun ? `${diagnostics.latestRefreshRun.status} (${String(diagnostics.latestRefreshRun.updated_at ?? diagnostics.latestRefreshRun.created_at).slice(0,19)})${diagnostics.latestRefreshRun.error_message ? ` — ${diagnostics.latestRefreshRun.error_message}` : ""}` : "No refresh runs yet"}</div></div></div>{diagnostics.missingGscProjects.length > 0 && <p className="mt-3 text-sm text-amber-800">Projects missing GSC mapping: {diagnostics.missingGscProjects.join(", ")}</p>}</div>;
}

function MemberIndexSection({ title, members, mode }: { title: string; members: Awaited<ReturnType<typeof getAdminMemberRows>>; mode: "quantity" | "quality" }) {
  const sorted = [...members].sort((a, b) => mode === "quantity" ? b.quantityIndex - a.quantityIndex : b.qualityIndex - a.qualityIndex);
  const sectionTone = mode === "quantity" ? "border-blue-100 bg-blue-50/60" : "border-slate-200 bg-white";
  const headingTone = mode === "quantity" ? "bg-blue-50 text-blue-950" : "bg-slate-50 text-slate-950";
  return <DataTableContainer><div className={`${sectionTone}`}><h4 className={`border-b p-3 font-semibold ${headingTone}`}>{title}</h4><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Member</th><th>{mode === "quantity" ? "Quantity Index" : "Quality Index"}</th><th>URLs</th><th>Growth</th><th>Status</th><th>{mode === "quantity" ? "Support signal" : "Portfolio health"}</th></tr></thead><tbody>{sorted.map(m=><tr className="border-t" key={m.member_name}><td className="p-3"><Link className="text-blue-700" href={`/member-insights/${encodeURIComponent(m.member_name)}`}>{m.member_name}</Link></td><td className={mode === "quantity" ? "font-semibold text-blue-950" : undefined}>{mode === "quantity" ? m.quantityIndex : m.qualityIndex}</td><td>{m.urlCount}</td><td><span className={getGrowthClassName(m.click_growth_pct)}>{fmtGrowth(m.click_growth_pct)}</span></td><td>{m.snapshotStatus}</td><td>{mode === "quantity" ? m.supportSignal : m.portfolioHealth}</td></tr>)}{sorted.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No active content URLs found.</td></tr>}</tbody></table></div></DataTableContainer>;
}
