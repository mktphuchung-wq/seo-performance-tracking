import { query } from "./db";
import { getPreviousRange, comparePerformance, type ComparedUrlPerformance } from "./growth";
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
  const sql = `select c.id, c.project, c.url, c.member_name, c.member_email, c.gsc_property,
    coalesce(cur.clicks,0) clicks, coalesce(cur.impressions,0) impressions, coalesce(cur.ctr,0) ctr, coalesce(cur.position,0) position,
    coalesce(prev.clicks,0) previous_clicks, coalesce(prev.impressions,0) previous_impressions, coalesce(prev.ctr,0) previous_ctr, coalesce(prev.position,0) previous_position
    from content_urls c
    left join url_performance_snapshots cur on (cur.content_url_id = c.id or (cur.content_url_id is null and cur.url_hash = c.url_hash)) and cur.range_key = $1 and cur.start_date = $2::date and cur.end_date = $3::date
    left join url_performance_snapshots prev on (prev.content_url_id = c.id or (prev.content_url_id is null and prev.url_hash = c.url_hash)) and prev.range_key = $4 and prev.start_date = $5::date and prev.end_date = $6::date
    where coalesce(c.is_active,true) = true
    order by c.project, c.member_name, c.url`;
  const previousRange = getPreviousRange(range);
  const res = await query(sql, [rangeKey, range.startDate, range.endDate, `previous:${rangeKey}`, previousRange.startDate, previousRange.endDate]);
  return res.rows.map((r: any) => {
    const base = dbContentUrl(r);
    const current: UrlPerformance = { ...base, ...normalizeMetric(r), opportunity: classifyOpportunity(normalizeMetric(r)) };
    const prev: UrlPerformance = { ...base, clicks: num(r.previous_clicks), impressions: num(r.previous_impressions), ctr: num(r.previous_ctr), position: num(r.previous_position), opportunity: "normal" };
    return comparePerformance([current], [prev], rangeKey, range)[0];
  });
}

export async function upsertUrlSnapshot(contentUrlId: string, rangeKey: string, range: DateRange, m: UrlMetrics) {
  await query(`insert into url_performance_snapshots (content_url_id, range_key, start_date, end_date, clicks, impressions, ctr, position, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict (content_url_id, range_key, start_date, end_date) do update set clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, position=excluded.position, updated_at=now()`,
    [contentUrlId, rangeKey, range.startDate, range.endDate, m.clicks, m.impressions, m.ctr, m.position]);
}

export async function upsertMemberSnapshots(rows: ComparedUrlPerformance[], rangeKey: string, range: DateRange) {
  for (const s of scoreMembers(rows)) {
    await query(`insert into member_performance_snapshots (member_name, range_key, start_date, end_date, url_count, clicks, impressions, ctr, position, quantity_index, quality_index, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      on conflict (member_name, range_key, start_date, end_date) do update set url_count=excluded.url_count, clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, position=excluded.position, quantity_index=excluded.quantity_index, quality_index=excluded.quality_index, updated_at=now()`,
      [s.member_name, rangeKey, range.startDate, range.endDate, s.urlCount, s.clicks, s.impressions, s.ctr, s.position, s.quantityIndex, s.qualityIndex]);
  }
}

export async function getUrlDetailFromDb(id: string, rangeKey: string, range: DateRange) {
  const rows = await getDbPerformance(rangeKey, range);
  const overview = rows.find(r => r.id === id || r.url === id);
  if (!overview) return null;
  const dailyRes = await query(`select s.date, s.clicks, s.impressions, s.ctr, s.position
    from url_performance_daily_snapshots s
    left join content_urls c on c.id = $1
    where (s.content_url_id = c.id or (s.content_url_id is null and s.url_hash = c.url_hash)) and s.date between $2::date and $3::date
    order by s.date`, [overview.id, range.startDate, range.endDate]).catch(() => ({ rows: [] }));
  const queryRes = await query(`select s.query, s.clicks, s.impressions, s.ctr, s.position
    from url_query_snapshots s
    left join content_urls c on c.id = $1
    where (s.content_url_id = c.id or (s.content_url_id is null and s.url_hash = c.url_hash)) and s.range_key=$2 and s.start_date=$3::date and s.end_date=$4::date
    order by s.clicks desc limit 250`, [overview.id, rangeKey, range.startDate, range.endDate]).catch(() => ({ rows: [] }));
  const queries: QueryMetric[] = queryRes.rows.map((r: any) => ({ query: r.query, ...normalizeMetric(r), opportunity: classifyOpportunity(normalizeMetric(r)) }));
  return { overview, warning: overview.warning, daily: dailyRes.rows.map((r: any): DailyMetric => ({ date: String(r.date).slice(0,10), ...normalizeMetric(r) })), queries, ctrOpportunities: queries.filter(q=>q.opportunity==="ctr_opportunity"), rankingOpportunities: queries.filter(q=>q.opportunity==="ranking_opportunity"), winningQueries: queries.filter(q=>q.opportunity==="winner").slice(0,10), range, hasData: overview.clicks > 0 || overview.impressions > 0 };
}

export type AdminDiagnostic = {
  activeUrls: number;
  missingMemberEmail: number;
  missingGscProperty: number;
  missingGscProjects: string[];
  latestSyncRun: any | null;
  latestRefreshJob: any | null;
};

export type AdminMemberRow = ReturnType<typeof scoreMembers>[number] & { snapshotStatus: string; snapshotUpdatedAt?: string | null };

export async function getAdminDiagnostics(): Promise<AdminDiagnostic> {
  const [counts, projects, syncRuns, refreshJobs] = await Promise.all([
    query<{ active_urls: number; missing_member_email: number; missing_gsc_property: number }>(`select count(*)::int active_urls,
      count(*) filter (where nullif(member_email,'') is null)::int missing_member_email,
      count(*) filter (where nullif(gsc_property,'') is null)::int missing_gsc_property
      from content_urls where coalesce(is_active,true)=true`),
    query<{ project: string }>(`select distinct project from content_urls where coalesce(is_active,true)=true and nullif(gsc_property,'') is null order by project`),
    query<any>("select * from sync_runs order by created_at desc limit 1").catch(() => ({ rows: [] })),
    query<any>("select * from refresh_jobs order by created_at desc limit 1").catch(() => ({ rows: [] })),
  ]);
  const row = counts.rows[0] ?? { active_urls: 0, missing_member_email: 0, missing_gsc_property: 0 };
  return {
    activeUrls: Number(row.active_urls ?? 0),
    missingMemberEmail: Number(row.missing_member_email ?? 0),
    missingGscProperty: Number(row.missing_gsc_property ?? 0),
    missingGscProjects: projects.rows.map((r) => r.project).filter(Boolean),
    latestSyncRun: syncRuns.rows[0] ?? null,
    latestRefreshJob: refreshJobs.rows[0] ?? null,
  };
}

export async function getAdminMemberRows(rangeKey: string, range: DateRange, performanceRows: ComparedUrlPerformance[]): Promise<AdminMemberRow[]> {
  const scored = scoreMembers(performanceRows);
  const snapshotRows = await query<any>(`select distinct on (member_name) member_name, updated_at
    from member_performance_snapshots
    where range_key=$1 and start_date=$2::date and end_date=$3::date
    order by member_name, updated_at desc`, [rangeKey, range.startDate, range.endDate]).catch(() => ({ rows: [] }));
  const snapshotMap = new Map(snapshotRows.rows.map((row: any) => [String(row.member_name), row.updated_at ? String(row.updated_at) : null]));
  return scored.map((member) => ({
    ...member,
    snapshotStatus: snapshotMap.has(member.member_name) ? "Refreshed" : "Pending refresh",
    snapshotUpdatedAt: snapshotMap.get(member.member_name) ?? null,
  }));
}
