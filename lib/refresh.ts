import crypto from "crypto";
import { query, transaction } from "./db";
import { classifyGoogleApiError, getSheetContentUrlRows, searchAnalytics, type UrlMetrics } from "./google";
import type { DateRange } from "./dates";
import { cacheKey, comparePerformance, getPreviousRange } from "./growth";
import { dbContentUrl } from "./postgres";
import { classifyOpportunity } from "./metrics";
import { scoreMembers } from "./scoring";
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
    if (classifyGoogleApiError(error)) throw error;
    return result;
  }
}
export type CacheRefreshResult = { ok: boolean; runId?: string | null; totalUrls: number; processedUrls: number; urlsWithData: number; noDataUrls: number; failedUrls: number; errorMessage?: string | null };

const zeroMetrics: UrlMetrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

function recommendationFor(status: string) {
  if (status === "no_data") return "No GSC data for this URL in the selected range.";
  if (status === "declining") return "Review lost queries and refresh optimization priorities.";
  if (status === "new_signal") return "Monitor new search visibility and build on early traction.";
  if (status === "growing") return "Keep supporting this URL's search momentum.";
  return "Monitor performance.";
}

export async function refreshPerformanceCache(accessToken: string, rangeKey: string, range: DateRange, triggeredBy?: string): Promise<CacheRefreshResult> {
  let runId: string | null = null;
  const previousRange = getPreviousRange(range);
  try {
    const active = (await query<any>(`select id, url_hash, project, url, member_name, member_email, gsc_property from content_urls where coalesce(is_active,true)=true order by project, member_name, url`)).rows.map(dbContentUrl);
    if (active.length === 0) return { ok: false, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: "No active URLs found. Run Sync URLs from Sheet first." };
    const missingHash = active.filter((u) => !u.urlHash);
    if (missingHash.length) return { ok: false, totalUrls: active.length, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: active.length, errorMessage: `${missingHash.length} active URLs are missing url_hash.` };
    const missingGsc = active.filter((u) => !u.gscProperty);
    if (missingGsc.length) return { ok: false, totalUrls: active.length, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: active.length, errorMessage: `${missingGsc.length} active URLs are missing gsc_property.` };

    const run = await query<{ id: string }>(`insert into refresh_runs (status, triggered_by, range_key, start_date, end_date, previous_start_date, previous_end_date, total_urls, processed_urls, urls_with_data, no_data_urls, failed_urls, started_at, created_at, updated_at) values ('running',$1,$2,$3,$4,$5,$6,$7,0,0,0,0,now(),now(),now()) returning id`, [triggeredBy ?? null, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, active.length]);
    runId = run.rows[0]?.id ?? null;

    const currentByUrl = new Map<string, UrlMetrics>();
    const previousByUrl = new Map<string, UrlMetrics>();
    for (const [property, group] of Object.entries(active.reduce<Record<string, typeof active>>((acc, row) => { (acc[row.gscProperty!] ??= []).push(row); return acc; }, {}))) {
      const [curRows, prevRows] = await Promise.all([
        searchAnalytics(accessToken, property, ["page"], range, undefined, 25000),
        searchAnalytics(accessToken, property, ["page"], previousRange, undefined, 25000),
      ]);
      const allowed = new Set(group.map((r) => r.url));
      for (const r of curRows) { const url = String(r.keys?.[0] ?? ""); if (allowed.has(url)) currentByUrl.set(url, { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 }); }
      for (const r of prevRows) { const url = String(r.keys?.[0] ?? ""); if (allowed.has(url)) previousByUrl.set(url, { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 }); }
    }

    const currentRows = active.map((row) => ({ ...row, ...(currentByUrl.get(row.url) ?? zeroMetrics), opportunity: classifyOpportunity(currentByUrl.get(row.url) ?? zeroMetrics) }));
    const previousRows = active.map((row) => ({ ...row, ...(previousByUrl.get(row.url) ?? zeroMetrics), opportunity: classifyOpportunity(previousByUrl.get(row.url) ?? zeroMetrics) }));
    const compared = comparePerformance(currentRows, previousRows, rangeKey, range);
    const urlsWithData = compared.filter((r) => r.clicks > 0 || r.impressions > 0).length;
    const noDataUrls = compared.length - urlsWithData;
    const members = scoreMembers(compared);

    await transaction(async (client) => {
      await client.query("delete from seo_performance_cache where range_key=$1", [rangeKey]);
      await client.query("delete from member_performance_cache where range_key=$1", [rangeKey]);
      for (const r of compared) {
        await client.query(`insert into seo_performance_cache (cache_key, content_url_id, url_hash, project, url, member_name, member_email, gsc_property, range_key, start_date, end_date, previous_start_date, previous_end_date, clicks, impressions, ctr, position, previous_clicks, previous_impressions, previous_ctr, previous_position, click_delta, click_growth_pct, impression_delta, impression_growth_pct, ctr_delta, position_delta, growth_status, opportunity_status, recommendation, refreshed_at, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now(),now(),now())`, [cacheKey(r, rangeKey, range), r.id, r.urlHash ?? null, r.project, r.url, r.member_name, r.memberEmail, r.gscProperty ?? null, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, r.clicks, r.impressions, r.ctr, r.position, r.previous_clicks, r.previous_impressions, r.previous_ctr, r.previous_position, r.click_delta, r.click_growth_pct, r.impression_delta, r.impression_growth_pct, r.ctr_delta, r.position_delta, r.status, r.opportunity, recommendationFor(r.status)]);
      }
      for (const m of members) {
        const memberRows = compared.filter((r) => r.member_name === m.member_name);
        const email = memberRows.find((r) => r.memberEmail)?.memberEmail ?? null;
        await client.query(`insert into member_performance_cache (cache_key, member_name, member_email, range_key, start_date, end_date, previous_start_date, previous_end_date, url_count, urls_with_data, growing_urls, stable_urls, declining_urls, no_data_urls, clicks, impressions, ctr, position, previous_clicks, previous_impressions, click_delta, click_growth_pct, impression_delta, impression_growth_pct, quantity_index, quality_index, support_signal, main_strength, main_risk, suggested_support, refreshed_at, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,now(),now(),now())`, [`${m.member_name}|${rangeKey}|${range.startDate}|${range.endDate}`, m.member_name, email, rangeKey, range.startDate, range.endDate, previousRange.startDate, previousRange.endDate, m.urlCount, m.urlCount - m.noData, m.growing, Math.max(0, m.urlCount - m.growing - m.declining - m.noData), m.declining, m.noData, m.clicks, m.impressions, m.ctr, m.position, m.previous_clicks, m.previous_impressions, m.click_delta, m.click_growth_pct, m.impression_delta, m.impression_growth_pct, m.quantityIndex, m.qualityIndex, m.supportSignal, m.portfolioHealth, m.priorityActions ? "Has URLs needing attention" : "No major risk", m.supportSignal]);
      }
      await client.query("update refresh_runs set status='success', processed_urls=$2, urls_with_data=$3, no_data_urls=$4, failed_urls=0, finished_at=now(), updated_at=now() where id=$1", [runId, compared.length, urlsWithData, noDataUrls]);
    });
    return { ok: true, runId, totalUrls: active.length, processedUrls: active.length, urlsWithData, noDataUrls, failedUrls: 0, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Search Console refresh failed";
    if (runId) await query("update refresh_runs set status='failed', failed_urls=total_urls, error_message=$2, finished_at=now(), updated_at=now() where id=$1", [runId, message]).catch(() => undefined);
    return { ok: false, runId, totalUrls: 0, processedUrls: 0, urlsWithData: 0, noDataUrls: 0, failedUrls: 0, errorMessage: message };
  }
}
