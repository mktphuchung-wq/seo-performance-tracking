import { query } from "./db";
import { comparePerformance, type ComparedUrlPerformance } from "./growth";
import { classifyOpportunity } from "./metrics";
import { type ContentUrl, type UrlPerformance, type UrlMetrics, type QueryMetric, type DailyMetric } from "./google";
import type { DateRange } from "./dates";
import { scoreMembers } from "./scoring";
import { adjustMemberFinal, defaultProjectKpiSettings, getProjectKpiSettings } from "./project-kpi";

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const normalizeMetric = (r: any): UrlMetrics => ({ clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) });
const normalizeDbDate = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

export function dbContentUrl(row: any): ContentUrl {
  return { id: String(row.id), urlHash: row.url_hash ? String(row.url_hash) : undefined, project: row.project ?? "", url: row.url ?? "", member_name: row.member_name ?? "", memberEmail: String(row.member_email ?? "").toLowerCase(), gscProperty: row.gsc_property ?? undefined, content_worked_at: normalizeDbDate(row.content_worked_at), content_type: row.content_type ?? null, last_updated_at: normalizeDbDate(row.updated_at), created_at: normalizeDbDate(row.created_at) };
}

export async function getDbContentUrls(): Promise<ContentUrl[]> {
  const res = await query("select id, project, url, member_name, member_email, gsc_property, content_worked_at, content_type, updated_at, created_at from public.content_urls where coalesce(is_active,true) = true order by project, member_name, url");
  return res.rows.map(dbContentUrl);
}

export async function getDbPerformance(rangeKey: string, range: DateRange): Promise<ComparedUrlPerformance[]> {
  const sql = `select c.id, c.url_hash, c.project, c.url, c.member_name, c.member_email, c.gsc_property, c.content_worked_at, coalesce(v.content_type, c.content_type) content_type, c.updated_at, c.created_at,
    coalesce(v.clicks,0) clicks, coalesce(v.impressions,0) impressions, coalesce(v.ctr,0) ctr, coalesce(v.position,0) position,
    coalesce(v.previous_clicks,0) previous_clicks, coalesce(v.previous_impressions,0) previous_impressions, coalesce(v.previous_ctr,0) previous_ctr, coalesce(v.previous_position,0) previous_position,
    v.growth_status, v.opportunity_status, v.click_delta, v.click_growth_pct, v.impression_delta, v.impression_growth_pct, v.ctr_delta, v.position_delta, v.refreshed_at
    from public.content_urls c
    left join public.dashboard_url_performance v on (v.content_url_id = c.id or (v.content_url_id is null and v.url_hash = c.url_hash)) and v.range_key = $1
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
  project?: string;
  member_name: string;
  member_email: string | null;
  performance_kpi_1m_pct: number | null;
  performance_kpi_3m_pct: number | null;
  performance_kpi_6m_pct: number | null;
  performance_kpi_all_time_pct?: number | null;
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
  raw_performance_final_pct?: number | null;
  adjusted_performance_final_pct?: number | null;
  adjustment_status?: string;
  adjustment_reason?: string;
  project_kpi_type?: string;
  kpi_protection_applied?: boolean;
  pm_review_required?: boolean;
};

const nullableNum = (v: unknown) => v === null || v === undefined ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

function mapMemberPerformanceFinal(row: any): MemberPerformanceFinalSummary {
  return {
    project: row.project ? String(row.project) : undefined,
    member_name: row.member_name ?? "",
    member_email: row.member_email ? String(row.member_email).toLowerCase() : null,
    performance_kpi_1m_pct: nullableNum(row.performance_kpi_1m_pct),
    performance_kpi_3m_pct: nullableNum(row.performance_kpi_3m_pct),
    performance_kpi_6m_pct: nullableNum(row.performance_kpi_6m_pct),
    performance_kpi_all_time_pct: nullableNum(row.performance_kpi_all_time_pct),
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

export type MemberProjectPerformanceFinalSummary = MemberPerformanceFinalSummary & { project: string };

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 100) / 100 : null;
}

function total(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function rollupMemberProjects(rows: MemberProjectPerformanceFinalSummary[]): MemberPerformanceFinalSummary {
  const adjusted = average(rows.map((row) => row.adjusted_performance_final_pct));
  const raw = average(rows.map((row) => row.raw_performance_final_pct));
  const coverage = average(rows.map((row) => row.performance_final_coverage)) ?? 0;
  const completedProjects = rows.filter((row) => row.adjusted_performance_final_pct != null).length;
  const refreshedAt = rows.map((row) => row.refreshed_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    member_name: rows[0]?.member_name ?? "",
    member_email: rows.find((row) => row.member_email)?.member_email ?? null,
    performance_kpi_1m_pct: average(rows.map((row) => row.performance_kpi_1m_pct)),
    performance_kpi_3m_pct: average(rows.map((row) => row.performance_kpi_3m_pct)),
    performance_kpi_6m_pct: average(rows.map((row) => row.performance_kpi_6m_pct)),
    performance_kpi_all_time_pct: average(rows.map((row) => row.performance_kpi_all_time_pct)),
    performance_final_pct: adjusted,
    performance_final_status: completedProjects === 0 ? "insufficient_data" : completedProjects === rows.length && rows.every((row) => row.performance_final_status === "complete") ? "complete" : "partial",
    performance_final_coverage: coverage,
    performance_confidence: coverage >= 1 ? "high" : coverage >= 0.8 ? "medium" : coverage > 0 ? "low" : "none",
    eligible_url_count_1m: total(rows.map((row) => row.eligible_url_count_1m)),
    eligible_url_count_3m: total(rows.map((row) => row.eligible_url_count_3m)),
    eligible_url_count_6m: total(rows.map((row) => row.eligible_url_count_6m)),
    excluded_no_data_url_count_1m: total(rows.map((row) => row.excluded_no_data_url_count_1m)),
    excluded_no_data_url_count_3m: total(rows.map((row) => row.excluded_no_data_url_count_3m)),
    excluded_no_data_url_count_6m: total(rows.map((row) => row.excluded_no_data_url_count_6m)),
    refreshed_at: refreshedAt,
    raw_performance_final_pct: raw,
    adjusted_performance_final_pct: adjusted,
    adjustment_status: "project_rollup",
    adjustment_reason: `Rolled up after applying project-specific KPI settings to ${rows.length} project${rows.length === 1 ? "" : "s"}; projects are equally weighted in this compatibility performance rollup.`,
    project_kpi_type: rows.length === 1 ? rows[0].project_kpi_type : "multi_project_rollup",
    kpi_protection_applied: rows.some((row) => row.kpi_protection_applied),
    pm_review_required: rows.some((row) => row.pm_review_required),
  };
}

export async function getAllMemberProjectPerformanceFinal(): Promise<MemberProjectPerformanceFinalSummary[]> {
  const [res, settings] = await Promise.all([
    query<any>(`select * from public.member_project_performance_final_view order by member_name, project`),
    getProjectKpiSettings(),
  ]);
  const settingsByProject = new Map(settings.map((item) => [item.project, item]));
  return res.rows.map((row) => {
    const mapped = mapMemberPerformanceFinal(row) as MemberProjectPerformanceFinalSummary;
    const projectSettings = settingsByProject.get(mapped.project) ?? defaultProjectKpiSettings(mapped.project);
    return adjustMemberFinal(mapped, projectSettings) as MemberProjectPerformanceFinalSummary;
  });
}

export async function getMemberProjectPerformanceFinalByMember(memberNameOrEmail: string): Promise<MemberProjectPerformanceFinalSummary[]> {
  const key = memberNameOrEmail.trim().toLowerCase();
  if (!key) return [];
  const rows = await getAllMemberProjectPerformanceFinal();
  return rows.filter((row) => row.member_name.toLowerCase() === key || row.member_email?.toLowerCase() === key);
}

export async function getMemberPerformanceFinalByMember(memberNameOrEmail: string): Promise<MemberPerformanceFinalSummary | null> {
  const key = memberNameOrEmail.trim().toLowerCase();
  if (!key) return null;
  const rows = await getMemberProjectPerformanceFinalByMember(key);
  return rows.length ? rollupMemberProjects(rows) : null;
}

export async function getAllMemberPerformanceFinal(): Promise<MemberPerformanceFinalSummary[]> {
  const projectRows = await getAllMemberProjectPerformanceFinal();
  const grouped = projectRows.reduce<Record<string, MemberProjectPerformanceFinalSummary[]>>((acc, row) => {
    (acc[row.member_name] ??= []).push(row);
    return acc;
  }, {});
  return Object.values(grouped).map(rollupMemberProjects).sort((a, b) => a.member_name.localeCompare(b.member_name));
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
  contentWorkedAtColumnExists: boolean;
  urlsMissingContentWorkedAt: number;
  missingGscProjects: string[];
  latestSyncRun: any | null;
  latestRefreshRun: any | null;
};

export type AdminMemberRow = ReturnType<typeof scoreMembers>[number] & { snapshotStatus: string; snapshotUpdatedAt?: string | null; finalPerformance?: MemberPerformanceFinalSummary | null };

export async function getAdminDiagnostics(): Promise<AdminDiagnostic> {
  const [contentWorkedAtColumn, counts, projects, syncRuns, refreshJobs] = await Promise.all([
    query<{ exists: boolean }>(`select exists (select 1 from information_schema.columns where table_schema='public' and table_name='content_urls' and column_name='content_worked_at')`).catch(() => ({ rows: [{ exists: false }] })),
    query<{ active_urls: number; missing_member_email: number; missing_gsc_property: number; urls_missing_content_worked_at: number }>(`select count(*)::int active_urls,
      count(*) filter (where nullif(member_email,'') is null)::int missing_member_email,
      count(*) filter (where nullif(gsc_property,'') is null)::int missing_gsc_property,
      count(*) filter (where content_worked_at is null)::int urls_missing_content_worked_at
      from public.content_urls where coalesce(is_active,true)=true`).catch(() => ({ rows: [{ active_urls: 0, missing_member_email: 0, missing_gsc_property: 0, urls_missing_content_worked_at: 0 }] })),
    query<{ project: string }>(`select distinct project from public.content_urls where coalesce(is_active,true)=true and nullif(gsc_property,'') is null order by project`),
    query<any>("select * from public.sync_runs order by created_at desc limit 1").catch(() => ({ rows: [] })),
    query<any>("select * from public.refresh_runs order by created_at desc limit 1").catch(() => ({ rows: [] })),
  ]);
  const row = counts.rows[0] ?? { active_urls: 0, missing_member_email: 0, missing_gsc_property: 0, urls_missing_content_worked_at: 0 };
  const contentWorkedAtColumnExists = Boolean(contentWorkedAtColumn.rows[0]?.exists);
  return {
    activeUrls: Number(row.active_urls ?? 0),
    missingMemberEmail: Number(row.missing_member_email ?? 0),
    missingGscProperty: Number(row.missing_gsc_property ?? 0),
    contentWorkedAtColumnExists,
    urlsMissingContentWorkedAt: contentWorkedAtColumnExists ? Number(row.urls_missing_content_worked_at ?? 0) : 0,
    missingGscProjects: projects.rows.map((r) => r.project).filter(Boolean),
    latestSyncRun: syncRuns.rows[0] ?? null,
    latestRefreshRun: refreshJobs.rows[0] ?? null,
  };
}

export async function getAdminMemberRows(rangeKey: string, range: DateRange, performanceRows: ComparedUrlPerformance[]): Promise<AdminMemberRow[]> {
  const scored = scoreMembers(performanceRows);
  const [snapshotRows, finalRows] = await Promise.all([
    query<any>(`select member_name, max(updated_at) updated_at
      from public.seo_performance_cache
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
