import { google } from "googleapis";
import { appConfig, getMemberEmailMap, getProjectGscMap } from "./env";

export type ContentUrl = { id: string; project: string; url: string; member_name: string; memberEmail: string };
export type UrlMetrics = { clicks: number; impressions: number; ctr: number; position: number };
export type UrlPerformance = ContentUrl & UrlMetrics;
export type QueryMetric = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type DailyMetric = { date: string } & UrlMetrics;

function auth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

export async function getContentUrls(accessToken: string): Promise<ContentUrl[]> {
  if (!appConfig.sheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: appConfig.sheetId, range: `${appConfig.contentTab}!A:C` });
  const rows = result.data.values ?? [];
  const memberMap = getMemberEmailMap();
  return rows.slice(1).map((row, index) => {
    const [project = "", url = "", member_name = ""] = row as string[];
    return { id: String(index), project, url, member_name, memberEmail: (memberMap[member_name] ?? "").toLowerCase() };
  }).filter((row) => row.project && row.url && row.member_name);
}

export function filterRowsForEmail(rows: ContentUrl[], email: string, isAdmin = false): ContentUrl[] {
  if (isAdmin) return rows;
  return rows.filter((row) => row.memberEmail === email.toLowerCase());
}

function dates() {
  const end = appConfig.gscEndDate ? new Date(appConfig.gscEndDate) : new Date();
  const start = appConfig.gscStartDate ? new Date(appConfig.gscStartDate) : new Date(end.getTime() - 27 * 86400000);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function normalize(row: { clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }): UrlMetrics {
  return { clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? 0, position: row.position ?? 0 };
}

async function searchAnalytics(accessToken: string, siteUrl: string, dimensions: string[], page?: string, rowLimit = 250) {
  const webmasters = google.searchconsole({ version: "v1", auth: auth(accessToken) });
  const filters = page ? [{ dimension: "page", operator: "equals", expression: page }] : undefined;
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { ...dates(), dimensions, dimensionFilterGroups: filters ? [{ filters }] : undefined, rowLimit }
  });
  return res.data.rows ?? [];
}

export async function getUrlPerformance(rows: ContentUrl[], accessToken: string): Promise<UrlPerformance[]> {
  const projectMap = getProjectGscMap();
  return Promise.all(rows.map(async (row) => {
    const siteUrl = projectMap[row.project];
    if (!siteUrl) return { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const data = await searchAnalytics(accessToken, siteUrl, ["page"], row.url, 1);
    return { ...row, ...normalize(data[0] ?? {}) };
  }));
}

export async function getUrlDetail(row: ContentUrl, accessToken: string) {
  const siteUrl = getProjectGscMap()[row.project];
  if (!siteUrl) return { overview: { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0 }, daily: [], queries: [] };
  const [overviewRows, dailyRows, queryRows] = await Promise.all([
    searchAnalytics(accessToken, siteUrl, ["page"], row.url, 1),
    searchAnalytics(accessToken, siteUrl, ["date"], row.url, 90),
    searchAnalytics(accessToken, siteUrl, ["query"], row.url, 100)
  ]);
  const queries = queryRows.map((r) => ({ query: String(r.keys?.[0] ?? ""), ...normalize(r) }));
  return {
    overview: { ...row, ...normalize(overviewRows[0] ?? {}) },
    daily: dailyRows.map((r) => ({ date: String(r.keys?.[0] ?? ""), ...normalize(r) })),
    queries,
    ctrOpportunities: queries.filter((q) => q.impressions >= 100 && q.ctr < 0.02),
    rankingOpportunities: queries.filter((q) => q.position > 4 && q.position <= 20).sort((a, b) => b.impressions - a.impressions),
    winningQueries: queries.filter((q) => q.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 10),
    hasData: overviewRows.length > 0
  };
}

export function aggregate(rows: UrlPerformance[]): UrlMetrics {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const position = impressions ? rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}
