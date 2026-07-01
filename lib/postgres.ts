import { query } from "./db";
import { comparePerformance, type ComparedUrlPerformance } from "./growth";
import { classifyOpportunity } from "./metrics";
import { type ContentUrl, type UrlPerformance, type UrlMetrics, type QueryMetric, type DailyMetric } from "./google";
import type { DateRange } from "./dates";
import { scoreMembers } from "./scoring";

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const normalizeMetric = (r: any): UrlMetrics => ({ clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) });

export function dbContentUrl(row: any): ContentUrl {
  return { id: String(row.id), urlHash: row.url_hash ? String(row.url_hash) : undefined, project: row.project ?? "", url: row.url ?? "", member_name: row.member_name ?? "", memberEmail: String(row.member_email ?? "").toLowerCase(), gscProperty: row.gsc_property ?? undefined };
}

export async function getDbContentUrls(): Promise<ContentUrl[]> {
  const res = await query("select id, project, url, member_name, member_email, gsc_property from content_urls where coalesce(is_active,true) = true order by project, member_name, url");
  return res.rows.map(dbContentUrl);
}

export async function getDbPerformance(rangeKey: string, range: DateRange): Promise<ComparedUrlPerformance[]> {
  const sql = `select c.id, c.url_hash, c.project, c.url, c.member_name, c.member_email, c.gsc_property,
    coalesce(v.clicks,0) clicks, coalesce(v.impressions,0) impressions, coalesce(v.ctr,0) ctr, coalesce(v.position,0) position,
    coalesce(v.previous_clicks,0) previous_clicks, coalesce(v.previous_impressions,0) previous_impressions, coalesce(v.previous_ctr,0) previous_ctr, coalesce(v.previous_position,0) previous_position,
    v.growth_status, v.opportunity_status, v.click_delta, v.click_growth_pct, v.impression_delta, v.impression_growth_pct, v.ctr_delta, v.position_delta, v.refreshed_at
    from content_urls c
    left join dashboard_url_performance v on (v.content_url_id = c.id or (v.content_url_id is null and v.url_hash = c.url_hash)) and v.range_key = $1
    where coalesce(c.is_active,true) = true
    order by c.project, c.member_name, c.url`;
  const res = await query(sql, [rangeKey]);
  return res.rows.map((r: any) => {
    const base = dbContentUrl(r);
    const current: UrlPerformance = { ...base, ...normalizeMetric(r), opportunity: (r.opportunity_status as any) || classifyOpportunity(normalizeMetric(r)), warning: r.refreshed_at ? undefined : "Not refreshed yet" };
    const prev: UrlPerformance = { ...base, clicks: num(r.previous_clicks), impressions: num(r.previous_impressions), ctr: num(r.previous_ctr), position: num(r.previous_position), opportunity: "normal" };
    const compared = comparePerformance([current], [prev], rangeKey, range)[0];
    return { ...compared, status: (r.growth_status as any) || compared.status, click_delta: r.click_delta == null ? compared.click_delta : num(r.click_delta), click_growth_pct: r.click_growth_pct == null ? compared.click_growth_pct : num(r.click_growth_pct), impression_delta: r.impression_delta == null ? compared.impression_delta : num(r.impression_delta), impression_growth_pct: r.impression_growth_pct == null ? compared.impression_growth_pct : num(r.impression_growth_pct), ctr_delta: r.ctr_delta == null ? compared.ctr_delta : num(r.ctr_delta), position_delta: r.position_delta == null ? compared.position_delta : num(r.position_delta), refreshed_at: r.refreshed_at ? String(r.refreshed_at) : null };
  });
}

export type MemberPerformanceFinalSummary = {
  member_name: string;
  member_email: string | null;
  performance_kpi_1m_pct: number | null;
  performance_kpi_3m_pct: number | null;
  performance_kpi_6m_pct: number | null;
  performance_final_pct: number | null;
  performance_final_status: "complete" | "partial" | "insufficient_data" | "pending_refresh";
  performance_final_coverage: number;
  performance_confidence: string;
  eligible_url_count_1m: number | null;
  eligible_url_count_3m: number | null;
  eligible_url_count_6m: number | null;
  excluded_no_data_url_count_1m: number | null;
  excluded_no_data_url_count_3m: number | null;
  excluded_no_data_url_count_6m: number | null;
  refreshed_at: string | null;
};

const nullableNum = (v: unknown) => v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

function mapMemberPerformanceFinal(row: any): MemberPerformanceFinalSummary {
  return {
    member_name: row.member_name ?? "",
    member_email: row.member_email ? String(row.member_email).toLowerCase() : null,
    performance_kpi_1m_pct: nullableNum(row.performance_kpi_1m_pct),
    performance_kpi_3m_pct: nullableNum(row.performance_kpi_3m_pct),
    performance_kpi_6m_pct: nullableNum(row.performance_kpi_6m_pct),
    performance_final_pct: nullableNum(row.performance_final_pct),
    performance_final_status: row.performance_final_status || "insufficient_data",
    performance_final_coverage: num(row.performance_final_coverage),
    performance_confidence: row.performance_confidence || "none",
    eligible_url_count_1m: nullableNum(row.eligible_url_count_1m),
    eligible_url_count_3m: nullableNum(row.eligible_url_count_3m),
    eligible_url_count_6m: nullableNum(row.eligible_url_count_6m),
    excluded_no_data_url_count_1m: nullableNum(row.excluded_no_data_url_count_1m),
    excluded_no_data_url_count_3m: nullableNum(row.excluded_no_data_url_count_3m),
    excluded_no_data_url_count_6m: nullableNum(row.excluded_no_data_url_count_6m),
    refreshed_at: row.refreshed_at ? String(row.refreshed_at) : null,
  };
}

export async function getMemberPerformanceFinalByMember(memberNameOrEmail: string): Promise<MemberPerformanceFinalSummary | null> {
  const key = memberNameOrEmail.trim().toLowerCase();
  if (!key) return null;
  const res = await query<any>(`select * from member_performance_final_view where lower(member_name) = $1 or lower(coalesce(member_email, '')) = $1 limit 1`, [key]);
  return res.rows[0] ? mapMemberPerformanceFinal(res.rows[0]) : null;
}

export async function getAllMemberPerformanceFinal(): Promise<MemberPerformanceFinalSummary[]> {
  const res = await query<any>(`select * from member_performance_final_view order by member_name`);
  return res.rows.map(mapMemberPerformanceFinal);
}

export async function getUrlDetailFromDb(id: string, rangeKey: string, range: DateRange) {
  const rows = await getDbPerformance(rangeKey, range);
  const overview = rows.find(r => r.id === id || r.url === id);
  if (!overview) return null;
  return { overview, warning: overview.warning, daily: [] as DailyMetric[], queries: [] as QueryMetric[], ctrOpportunities: [], rankingOpportunities: [], winningQueries: [], range, hasData: overview.clicks > 0 || overview.impressions > 0 };
}

export type AdminDiagnostic = {
  activeUrls: number;
  missingMemberEmail: number;
  missingGscProperty: number;
  missingGscProjects: string[];
  latestSyncRun: any | null;
  latestRefreshRun: any | null;
};

export type AdminMemberRow = ReturnType<typeof scoreMembers>[number] & { snapshotStatus: string; snapshotUpdatedAt?: string | null; finalPerformance?: MemberPerformanceFinalSummary | null };

export async function getAdminDiagnostics(): Promise<AdminDiagnostic> {
  const [counts, projects, syncRuns, refreshJobs] = await Promise.all([
    query<{ active_urls: number; missing_member_email: number; missing_gsc_property: number }>(`select count(*)::int active_urls,
      count(*) filter (where nullif(member_email,'') is null)::int missing_member_email,
      count(*) filter (where nullif(gsc_property,'') is null)::int missing_gsc_property
      from content_urls where coalesce(is_active,true)=true`),
    query<{ project: string }>(`select distinct project from content_urls where coalesce(is_active,true)=true and nullif(gsc_property,'') is null order by project`),
    query<any>("select * from sync_runs order by created_at desc limit 1").catch(() => ({ rows: [] })),
    query<any>("select * from refresh_runs order by created_at desc limit 1").catch(() => ({ rows: [] })),
  ]);
  const row = counts.rows[0] ?? { active_urls: 0, missing_member_email: 0, missing_gsc_property: 0 };
  return {
    activeUrls: Number(row.active_urls ?? 0),
    missingMemberEmail: Number(row.missing_member_email ?? 0),
    missingGscProperty: Number(row.missing_gsc_property ?? 0),
    missingGscProjects: projects.rows.map((r) => r.project).filter(Boolean),
    latestSyncRun: syncRuns.rows[0] ?? null,
    latestRefreshRun: refreshJobs.rows[0] ?? null,
  };
}

export async function getAdminMemberRows(rangeKey: string, range: DateRange, performanceRows: ComparedUrlPerformance[]): Promise<AdminMemberRow[]> {
  const scored = scoreMembers(performanceRows);
  const [snapshotRows, finalRows] = await Promise.all([
    query<any>(`select member_name, max(updated_at) updated_at
      from seo_performance_cache
      where range_key=$1
      group by member_name`, [rangeKey]).catch(() => ({ rows: [] })),
    getAllMemberPerformanceFinal().catch(() => []),
  ]);
  const snapshotMap = new Map(snapshotRows.rows.map((row: any) => [String(row.member_name), row.updated_at ? String(row.updated_at) : null]));
  const finalMap = new Map(finalRows.map((row) => [row.member_name, row]));
  return scored.map((member) => ({
    ...member,
    snapshotStatus: snapshotMap.has(member.member_name) ? "Refreshed" : "Not refreshed yet",
    snapshotUpdatedAt: snapshotMap.get(member.member_name) ?? null,
    finalPerformance: finalMap.get(member.member_name) ?? null,
  }));
}
