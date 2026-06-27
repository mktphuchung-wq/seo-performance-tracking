import { google } from "googleapis";
import { appConfig } from "./env";
import { getPreviousRange, cacheKey, comparePerformance, type ComparedUrlPerformance } from "./growth";
import { getUrlPerformance, type ContentUrl } from "./google";
import type { DateRange } from "./dates";

const TAB = "performance_cache";
const HEADERS = ["cache_key","project","url","member_name","range_key","start_date","end_date","previous_start_date","previous_end_date","clicks","impressions","ctr","position","previous_clicks","previous_impressions","previous_ctr","previous_position","click_delta","click_growth_pct","impression_delta","impression_growth_pct","status","updated_at"];
function auth(accessToken: string) { const oauth2 = new google.auth.OAuth2(); oauth2.setCredentials({ access_token: accessToken }); return oauth2; }
const ttlMs = () => Number(process.env.CACHE_TTL_DAYS || 7) * 86400000;
function fresh(updatedAt: string) { const t = Date.parse(updatedAt); return Number.isFinite(t) && Date.now() - t < ttlMs(); }
function toNum(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function cacheRowToCompared(row: ContentUrl, values: string[], rangeKey: string, range: DateRange): ComparedUrlPerformance {
  const v = Object.fromEntries(HEADERS.map((h,i)=>[h, values[i] ?? ""]));
  return { ...row, clicks: toNum(v.clicks), impressions: toNum(v.impressions), ctr: toNum(v.ctr), position: toNum(v.position), opportunity: "normal", rangeKey, range, previousRange: getPreviousRange(range), previous_clicks: toNum(v.previous_clicks), previous_impressions: toNum(v.previous_impressions), previous_ctr: toNum(v.previous_ctr), previous_position: toNum(v.previous_position), click_delta: toNum(v.click_delta), click_growth_pct: v.click_growth_pct === "" ? null : toNum(v.click_growth_pct), impression_delta: toNum(v.impression_delta), impression_growth_pct: v.impression_growth_pct === "" ? null : toNum(v.impression_growth_pct), ctr_delta: toNum(v.ctr) - toNum(v.previous_ctr), position_delta: toNum(v.position) - toNum(v.previous_position), status: (v.status as ComparedUrlPerformance["status"]) || "no_data" };
}
async function ensureCacheTab(accessToken: string) {
  if (!appConfig.sheetId) return;
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: appConfig.sheetId });
  const exists = meta.data.sheets?.some((s)=>s.properties?.title===TAB);
  if (!exists) await sheets.spreadsheets.batchUpdate({ spreadsheetId: appConfig.sheetId, requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] } });
  const header = await sheets.spreadsheets.values.get({ spreadsheetId: appConfig.sheetId, range: `${TAB}!A1:W1` });
  if ((header.data.values?.[0] ?? []).join("|") !== HEADERS.join("|")) await sheets.spreadsheets.values.update({ spreadsheetId: appConfig.sheetId, range: `${TAB}!A1:W1`, valueInputOption: "RAW", requestBody: { values: [HEADERS] } });
}
async function readCache(accessToken: string) {
  await ensureCacheTab(accessToken);
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: appConfig.sheetId, range: `${TAB}!A2:W` });
  return res.data.values ?? [];
}
async function writeCache(accessToken: string, rows: ComparedUrlPerformance[]) {
  await ensureCacheTab(accessToken);
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const existing = await readCache(accessToken);
  const replacement = new Map(rows.map((r)=>[cacheKey(r, r.rangeKey, r.range), r]));
  const kept = existing.filter((v)=>!replacement.has(String(v[0] ?? "")));
  const now = new Date().toISOString();
  const added = rows.map((r)=>[cacheKey(r,r.rangeKey,r.range),r.project,r.url,r.member_name,r.rangeKey,r.range.startDate,r.range.endDate,r.previousRange.startDate,r.previousRange.endDate,r.clicks,r.impressions,r.ctr,r.position,r.previous_clicks,r.previous_impressions,r.previous_ctr,r.previous_position,r.click_delta,r.click_growth_pct ?? "",r.impression_delta,r.impression_growth_pct ?? "",r.status,now]);
  await sheets.spreadsheets.values.clear({ spreadsheetId: appConfig.sheetId, range: `${TAB}!A2:W` });
  if (kept.length || added.length) await sheets.spreadsheets.values.update({ spreadsheetId: appConfig.sheetId, range: `${TAB}!A2:W`, valueInputOption: "RAW", requestBody: { values: [...kept, ...added] } });
}
export async function getComparedPerformance(rows: ContentUrl[], accessToken: string, rangeKey: string, range: DateRange, force = false) {
  if (!rows.length) return { rows: [] as ComparedUrlPerformance[], cacheUsed: true, warning: undefined as string|undefined, lastUpdated: undefined as string|undefined };
  const keys = new Set(rows.map((r)=>cacheKey(r, rangeKey, range)));
  try {
    if (!force && appConfig.sheetId) {
      const cached = await readCache(accessToken);
      const byKey = new Map(cached.map((v)=>[String(v[0] ?? ""), v as string[]]));
      const hit = rows.map((r)=>byKey.get(cacheKey(r,rangeKey,range)));
      if (hit.every((v)=>v && fresh(String(v[22] ?? "")))) return { rows: rows.map((r,i)=>cacheRowToCompared(r, hit[i]!, rangeKey, range)), cacheUsed: true, lastUpdated: String(hit[0]?.[22] ?? "") };
    }
  } catch (e) { /* fall through to live fetch */ }
  const previous = getPreviousRange(range);
  try {
    const [cur, prev] = await Promise.all([getUrlPerformance(rows, accessToken, range), getUrlPerformance(rows, accessToken, previous)]);
    const compared = comparePerformance(cur, prev, rangeKey, range);
    if (appConfig.sheetId) await writeCache(accessToken, compared);
    return { rows: compared, cacheUsed: false, lastUpdated: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refresh failed";
    const cached = await readCache(accessToken).catch(()=>[]);
    const usable = rows.map((r)=>cached.find((v)=>keys.has(String(v[0] ?? "")) && String(v[0])===cacheKey(r,rangeKey,range))).filter(Boolean) as string[][];
    if (usable.length) return { rows: rows.map((r,i)=>cacheRowToCompared(r, usable[i], rangeKey, range)), cacheUsed: true, warning: message, lastUpdated: String(usable[0]?.[22] ?? "") };
    throw e;
  }
}
