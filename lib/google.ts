import { google } from "googleapis";
import { appConfig, getMemberEmailMap, getProjectGscMap } from "./env";
import { getDateRange, type DateRange } from "./dates";
import { classifyOpportunity, type OpportunityLabel } from "./metrics";

export type ContentUrl = { id: string; project: string; url: string; member_name: string; memberEmail: string; gscProperty?: string; warning?: string };
export type UrlMetrics = { clicks: number; impressions: number; ctr: number; position: number };
export type UrlPerformance = ContentUrl & UrlMetrics & { opportunity: OpportunityLabel };
export type QueryMetric = { query: string; opportunity: OpportunityLabel } & UrlMetrics;
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
  const projectMap = getProjectGscMap();
  return rows.slice(1).map((row, index) => {
    const [project = "", url = "", member_name = ""] = row as string[];
    const gscProperty = projectMap[project];
    return {
      id: String(index),
      project,
      url,
      member_name,
      memberEmail: (memberMap[member_name] ?? "").toLowerCase(),
      gscProperty,
      warning: gscProperty ? undefined : `Missing PROJECT_GSC_MAP entry for project: ${project}`
    };
  }).filter((row) => row.project && row.url && row.member_name);
}

export function filterRowsForEmail(rows: ContentUrl[], email: string, isAdmin = false): ContentUrl[] {
  if (isAdmin) return rows;
  return rows.filter((row) => row.memberEmail === email.toLowerCase());
}

function normalize(row: { clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }): UrlMetrics {
  return { clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? 0, position: row.position ?? 0 };
}

async function searchAnalytics(accessToken: string, siteUrl: string, dimensions: string[], range: DateRange, page?: string, rowLimit = 250) {
  const webmasters = google.searchconsole({ version: "v1", auth: auth(accessToken) });
  const filters = page ? [{ dimension: "page", operator: "equals", expression: page }] : undefined;
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: range.startDate, endDate: range.endDate, dimensions, dimensionFilterGroups: filters ? [{ groupType: "and", filters }] : undefined, type: "web", aggregationType: "byPage", rowLimit }
  });
  return res.data.rows ?? [];
}

export async function getUrlPerformance(rows: ContentUrl[], accessToken: string, range = getDateRange()): Promise<UrlPerformance[]> {
  return Promise.all(rows.map(async (row) => {
    if (!row.gscProperty) return { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0, opportunity: "no_data" as const };
    try {
      const data = await searchAnalytics(accessToken, row.gscProperty, ["page"], range, row.url, 1);
      const metrics = normalize(data[0] ?? {});
      return { ...row, ...metrics, opportunity: classifyOpportunity(metrics) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Search Console request failed";
      return { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0, opportunity: "no_data" as const, warning: message };
    }
  }));
}

export async function getUrlDetail(row: ContentUrl, accessToken: string, range = getDateRange()) {
  if (!row.gscProperty) return { overview: { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0, opportunity: "no_data" as const }, daily: [], queries: [], range, hasData: false, warning: row.warning };
  const [overviewRows, dailyRows, queryRows] = await Promise.all([
    searchAnalytics(accessToken, row.gscProperty, ["page"], range, row.url, 1),
    searchAnalytics(accessToken, row.gscProperty, ["date"], range, row.url, 500),
    searchAnalytics(accessToken, row.gscProperty, ["query"], range, row.url, 250)
  ]);
  const overviewMetrics = normalize(overviewRows[0] ?? {});
  const queries = queryRows.map((r) => { const metrics = normalize(r); return { query: String(r.keys?.[0] ?? ""), ...metrics, opportunity: classifyOpportunity(metrics) }; });
  return {
    overview: { ...row, ...overviewMetrics, opportunity: classifyOpportunity(overviewMetrics) },
    daily: dailyRows.map((r) => ({ date: String(r.keys?.[0] ?? ""), ...normalize(r) })),
    queries,
    ctrOpportunities: queries.filter((q) => q.opportunity === "ctr_opportunity"),
    rankingOpportunities: queries.filter((q) => q.opportunity === "ranking_opportunity").sort((a, b) => b.impressions - a.impressions),
    winningQueries: queries.filter((q) => q.opportunity === "winner").sort((a, b) => b.clicks - a.clicks).slice(0, 10),
    range,
    hasData: overviewRows.length > 0
  };
}

export function aggregate(rows: UrlPerformance[]): UrlMetrics {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const position = impressions ? rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}
