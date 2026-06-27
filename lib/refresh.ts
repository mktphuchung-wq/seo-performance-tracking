import crypto from "crypto";
import { query } from "./db";
import { getSheetContentUrlRows, searchAnalytics, type ContentUrl, type UrlMetrics } from "./google";
import type { DateRange } from "./dates";
import { getPreviousRange } from "./growth";
import { getDbContentUrls, getDbPerformance, upsertMemberSnapshots, upsertUrlSnapshot } from "./postgres";
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
export async function createRefreshJob(rangeKey: string, range: DateRange, requestedBy?: string) {
  const urls = await getDbContentUrls();
  if (urls.length === 0) return { jobId: null, itemCount: 0, totalUrls: 0, blockedProjects: [] as string[] };
  const blockedProjects = Array.from(new Set(urls.filter((row) => !row.gscProperty).map((row) => row.project).filter(Boolean))).sort();
  if (blockedProjects.length) return { jobId: null, itemCount: 0, totalUrls: urls.length, blockedProjects };
  const job = await query<{ id: string }>(`insert into refresh_jobs (range_key, start_date, end_date, status, requested_by, total_urls, processed_urls, failed_urls, created_at, updated_at)
    values ($1,$2,$3,'pending',$4,$5,0,0,now(),now()) returning id`, [rangeKey, range.startDate, range.endDate, requestedBy ?? null, urls.length]);
  for (const row of urls) await query("insert into refresh_job_items (refresh_job_id, content_url_id, status, created_at, updated_at) values ($1,$2,'pending',now(),now())", [job.rows[0].id, row.id]);
  return { jobId: job.rows[0].id, itemCount: urls.length, totalUrls: urls.length, blockedProjects: [] as string[] };
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
      await upsertUrlSnapshot(row.id, rangeKey, range, metrics);
      if (found) withData += 1; else withoutData += 1;
      processed.add(row.id);
    }
  }
  for (const row of rows.filter((r) => !processed.has(r.id))) {
    await upsertUrlSnapshot(row.id, rangeKey, range, zeroMetrics);
    withoutData += 1;
  }
  return { withData, withoutData };
}

export async function processRefreshBatch(accessToken: string, limit = 25, jobId?: string) {
  const jobs = await query<any>(`select id, range_key, start_date, end_date from refresh_jobs where status in ('pending','running') ${jobId ? "and id=$1" : ""} order by created_at limit 1`, jobId ? [jobId] : []);
  const job = jobs.rows[0];
  if (!job) return { processed: 0 };
  await query("update refresh_jobs set status='running', updated_at=now() where id=$1", [job.id]);
  const items = await query<any>(`select i.id item_id, c.id, c.project, c.url, c.member_name, c.member_email, c.gsc_property
    from refresh_job_items i join content_urls c on c.id=i.content_url_id or (i.content_url_id is null and i.url_hash = c.url_hash)
    where i.refresh_job_id=$1 and i.status='pending' order by i.created_at limit $2`, [job.id, limit]);
  const range = { startDate: String(job.start_date).slice(0,10), endDate: String(job.end_date).slice(0,10), label: String(job.range_key) };
  const rows = items.rows.map((r:any) => ({ id: String(r.id), project: r.project, url: r.url, member_name: r.member_name, memberEmail: String(r.member_email ?? "").toLowerCase(), gscProperty: r.gsc_property }));
  let currentResult = { withData: 0, withoutData: 0 };
  try {
    currentResult = await processRange(rows, accessToken, job.range_key, range);
    await processRange(rows, accessToken, `previous:${job.range_key}`, getPreviousRange(range));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Search Console refresh failed";
    for (const item of items.rows) await query("update refresh_job_items set status='failed', error_message=$2, updated_at=now() where id=$1", [item.item_id, message]);
    await query("update refresh_jobs set status='failed', failed_urls=(select count(*) from refresh_job_items where refresh_job_id=$1 and status='failed'), error_message=$2, finished_at=now(), updated_at=now() where id=$1", [job.id, message]);
    return { jobId: job.id, processed: 0, remaining: 0, urlsWithGscData: 0, urlsWithNoData: rows.length, failedUrls: rows.length, errorMessage: message };
  }
  for (const item of items.rows) await query("update refresh_job_items set status='complete', updated_at=now() where id=$1", [item.item_id]);
  const remaining = await query<any>("select count(*)::int count from refresh_job_items where refresh_job_id=$1 and status='pending'", [job.id]);
  if (remaining.rows[0].count === 0) {
    const compared = await getDbPerformance(job.range_key, range);
    await upsertMemberSnapshots(compared, job.range_key, range);
    await query("update refresh_jobs set status='complete', processed_urls=(select count(*) from refresh_job_items where refresh_job_id=$1 and status='complete'), failed_urls=(select count(*) from refresh_job_items where refresh_job_id=$1 and status='failed'), finished_at=now(), updated_at=now() where id=$1", [job.id]);
  }
  await query("update refresh_jobs set processed_urls=(select count(*) from refresh_job_items where refresh_job_id=$1 and status='complete'), failed_urls=(select count(*) from refresh_job_items where refresh_job_id=$1 and status='failed'), updated_at=now() where id=$1", [job.id]);
  const latest = await query<any>("select total_urls, processed_urls, failed_urls, error_message from refresh_jobs where id=$1", [job.id]);
  return { jobId: job.id, processed: rows.length, remaining: remaining.rows[0].count, totalUrls: Number(latest.rows[0]?.total_urls ?? 0), processedUrls: Number(latest.rows[0]?.processed_urls ?? 0), failedUrls: Number(latest.rows[0]?.failed_urls ?? 0), urlsWithGscData: currentResult.withData, urlsWithNoData: currentResult.withoutData, errorMessage: latest.rows[0]?.error_message ?? null };
}

export async function refreshStatus(jobId?: string) {
  const jobs = await query<any>(`select j.*, count(i.id)::int total_items, count(i.id) filter (where i.status='complete')::int complete_items, count(i.id) filter (where i.status='failed')::int failed_items
    from refresh_jobs j left join refresh_job_items i on i.refresh_job_id=j.id
    ${jobId ? "where j.id=$1" : ""} group by j.id order by j.created_at desc limit 10`, jobId ? [jobId] : []);
  return jobs.rows;
}
