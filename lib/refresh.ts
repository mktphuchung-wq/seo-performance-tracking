import crypto from "crypto";
import { query } from "./db";
import { getSheetContentUrlRows, searchAnalytics, type ContentUrl, type UrlMetrics } from "./google";
import type { DateRange } from "./dates";
import { getPreviousRange } from "./growth";
import { dbContentUrl, getDbPerformance, upsertMemberSnapshots, upsertSeoPerformanceCache } from "./postgres";
import { getMemberEmailMap, getProjectGscMap } from "./env";

export type SheetSyncResult = {
  status: "success" | "failed";
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  deactivatedRows: number;
  failedRows: number;
  errorMessage?: string;
};

function normalizeSheetUrl(value: string): string {
  const parsed = new URL(value.trim());
  parsed.hash = "";
  return parsed.toString();
}

function urlHash(project: string, normalizedUrl: string, memberName: string): string {
  return crypto.createHash("sha256").update(`${project}|${normalizedUrl}|${memberName}`).digest("hex");
}

async function recordSheetSyncRun(result: SheetSyncResult) {
  await query(`insert into sync_runs (source, status, total_rows, inserted_rows, updated_rows, deactivated_rows, failed_rows, error_message, created_at, finished_at)
    values ('google_sheet',$1,$2,$3,$4,$5,$6,$7,now(),now())`,
    [result.status, result.totalRows, result.insertedRows, result.updatedRows, result.deactivatedRows, result.failedRows, result.errorMessage ?? null]);
}

export async function syncSheetToDb(accessToken: string): Promise<SheetSyncResult> {
  const result: SheetSyncResult = { status: "success", totalRows: 0, insertedRows: 0, updatedRows: 0, deactivatedRows: 0, failedRows: 0 };
  try {
    const rows = await getSheetContentUrlRows(accessToken);
    const memberMap = getMemberEmailMap();
    const projectMap = getProjectGscMap();
    const activeHashes = new Set<string>();

    result.totalRows = rows.length;

    for (const row of rows) {
      const project = row.project.trim();
      const memberName = row.member_name.trim();
      let normalizedUrl = "";
      try {
        normalizedUrl = normalizeSheetUrl(row.url);
      } catch {
        result.failedRows += 1;
        continue;
      }

      if (!project || !memberName || !normalizedUrl) {
        result.failedRows += 1;
        continue;
      }

      const hash = urlHash(project, normalizedUrl, memberName);
      activeHashes.add(hash);
      const memberEmail = (memberMap[memberName] ?? "").toLowerCase();
      const gscProperty = projectMap[project] ?? null;
      const existing = await query<{ id: string; project: string; url: string; member_name: string; member_email: string | null; gsc_property: string | null; is_active: boolean | null }>(
        "select id, project, url, member_name, member_email, gsc_property, is_active from content_urls where url_hash=$1",
        [hash]
      );

      await query(`insert into content_urls (url_hash, project, url, member_name, member_email, gsc_property, is_active, source, last_seen_at, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,true,'google_sheet',now(),now(),now())
        on conflict (url_hash) do update set project=excluded.project, url=excluded.url, member_name=excluded.member_name, member_email=excluded.member_email,
          gsc_property=excluded.gsc_property, is_active=true, source='google_sheet', last_seen_at=now(), updated_at=now()`,
        [hash, project, normalizedUrl, memberName, memberEmail, gscProperty]);

      if (existing.rows.length === 0) {
        result.insertedRows += 1;
      } else {
        const current = existing.rows[0];
        const changed = current.project !== project || current.url !== normalizedUrl || current.member_name !== memberName ||
          String(current.member_email ?? "") !== memberEmail || String(current.gsc_property ?? "") !== String(gscProperty ?? "") || current.is_active !== true;
        if (changed) result.updatedRows += 1;
      }
    }

    const hashes = [...activeHashes];
    const deactivated = hashes.length
      ? await query("update content_urls set is_active=false, updated_at=now() where coalesce(is_active,true)=true and not (url_hash = any($1::text[]))", [hashes])
      : await query("update content_urls set is_active=false, updated_at=now() where coalesce(is_active,true)=true");
    result.deactivatedRows = deactivated.rowCount ?? 0;
    await recordSheetSyncRun(result);
    return result;
  } catch (error) {
    result.status = "failed";
    result.errorMessage = error instanceof Error ? error.message : "Google Sheet sync failed";
    try { await recordSheetSyncRun(result); } catch {}
    return result;
  }
}
export async function createRefreshJob(rangeKey: string, range: DateRange, triggeredBy?: string) {
  const urls = await query<any>(`select id, url_hash, project, url, member_name, member_email, gsc_property
    from public.content_urls
    where coalesce(is_active,true) = true
    order by project, member_name, url`);
  const activeUrls = urls.rows.map(dbContentUrl);
  if (activeUrls.length === 0) return { jobId: null, runId: null, itemCount: 0, totalUrls: 0, missingGscPropertyCount: 0, blockedProjects: [] as string[] };

  const missingGscRows = activeUrls.filter((row) => !row.gscProperty);
  const blockedProjects = Array.from(new Set(missingGscRows.map((row) => row.project).filter(Boolean))).sort();
  if (missingGscRows.length) {
    return { jobId: null, runId: null, itemCount: 0, totalUrls: activeUrls.length, missingGscPropertyCount: missingGscRows.length, blockedProjects };
  }

  const run = await query<{ id: string }>(`insert into public.refresh_runs
    (status, range_key, start_date, end_date, triggered_by, total_urls, processed_urls, failed_urls, urls_with_data, no_data_urls, started_at, created_at, updated_at)
    values ('pending',$1,$2,$3,$4,$5,0,0,0,0,now(),now(),now()) returning id`,
    [rangeKey, range.startDate, range.endDate, triggeredBy ?? null, activeUrls.length]);
  const runId = run.rows[0]?.id ?? null;
  return { jobId: runId, runId, itemCount: activeUrls.length, totalUrls: activeUrls.length, missingGscPropertyCount: 0, blockedProjects: [] as string[] };
}

const zeroMetrics: UrlMetrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

async function processRange(rows: ContentUrl[], accessToken: string, rangeKey: string, range: DateRange) {
  const byProperty = Object.entries(rows.reduce<Record<string, ContentUrl[]>>((a,r)=>{ if (r.gscProperty) (a[r.gscProperty]??=[]).push(r); return a; }, {}));
  const processed = new Set<string>();
  let withData = 0;
  let withoutData = 0;
  for (const [property, group] of byProperty) {
    const gscRows = await searchAnalytics(accessToken, property, ["page"], range, undefined, 25000);
    const byPage = new Map(gscRows.map((r) => [String(r.keys?.[0] ?? ""), r]));
    for (const row of group) {
      const found = byPage.get(row.url);
      const metrics = found ? { clicks: found.clicks ?? 0, impressions: found.impressions ?? 0, ctr: found.ctr ?? 0, position: found.position ?? 0 } : zeroMetrics;
      await upsertSeoPerformanceCache(row, rangeKey, range, metrics);
      if (found) withData += 1; else withoutData += 1;
      processed.add(row.id);
    }
  }
  for (const row of rows.filter((r) => !processed.has(r.id))) {
    await upsertSeoPerformanceCache(row, rangeKey, range, zeroMetrics);
    withoutData += 1;
  }
  return { withData, withoutData };
}

export async function processRefreshBatch(accessToken: string, _limit = 25, runId?: string) {
  const runs = await query<any>(`select id, range_key, start_date, end_date, total_urls from refresh_runs where status in ('pending','running') ${runId ? "and id=$1" : ""} order by created_at limit 1`, runId ? [runId] : []);
  const run = runs.rows[0];
  if (!run) return { processed: 0, remaining: 0 };

  await query("update refresh_runs set status='running', updated_at=now() where id=$1", [run.id]);
  const rowsRes = await query<any>(`select id, url_hash, project, url, member_name, member_email, gsc_property
    from content_urls where coalesce(is_active,true)=true order by project, member_name, url`);
  const rows = rowsRes.rows.map(dbContentUrl);
  const range = { startDate: String(run.start_date).slice(0,10), endDate: String(run.end_date).slice(0,10), label: String(run.range_key) };
  try {
    const currentResult = await processRange(rows, accessToken, run.range_key, range);
    await processRange(rows, accessToken, `previous:${run.range_key}`, getPreviousRange(range));
    const compared = await getDbPerformance(run.range_key, range);
    await upsertMemberSnapshots(compared, run.range_key, range).catch(() => undefined);
    await query(`update refresh_runs set status='complete', processed_urls=$2, failed_urls=0, urls_with_data=$3, no_data_urls=$4,
      finished_at=now(), updated_at=now() where id=$1`, [run.id, rows.length, currentResult.withData, currentResult.withoutData]);
    return { jobId: run.id, runId: run.id, processed: rows.length, remaining: 0, totalUrls: rows.length, processedUrls: rows.length, failedUrls: 0, urlsWithGscData: currentResult.withData, urlsWithNoData: currentResult.withoutData, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Search Console refresh failed";
    await query("update refresh_runs set status='failed', processed_urls=0, failed_urls=$2, no_data_urls=$2, error_message=$3, finished_at=now(), updated_at=now() where id=$1", [run.id, rows.length, message]);
    return { jobId: run.id, runId: run.id, processed: 0, remaining: 0, totalUrls: rows.length, processedUrls: 0, failedUrls: rows.length, urlsWithGscData: 0, urlsWithNoData: rows.length, errorMessage: message };
  }
}

export async function refreshStatus(runId?: string) {
  const runs = await query<any>(`select id, status, range_key, start_date, end_date, total_urls, processed_urls, failed_urls, urls_with_data, no_data_urls, error_message, created_at, updated_at,
    total_urls::int total_items, processed_urls::int complete_items, failed_urls::int failed_items
    from refresh_runs ${runId ? "where id=$1" : ""} order by created_at desc limit 10`, runId ? [runId] : []);
  return runs.rows;
}
