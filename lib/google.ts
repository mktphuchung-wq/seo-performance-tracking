import { google } from "googleapis";
import { appConfig, getMemberEmailMap, getProjectGscMap } from "./env";
import { getDateRange, type DateRange } from "./dates";
import { classifyOpportunity, type OpportunityLabel } from "./metrics";

export type ContentUrl = { id: string; urlHash?: string; project: string; url: string; member_name: string; memberEmail: string; gscProperty?: string; content_worked_at?: string | null; content_type?: string | null; last_updated_at?: string | null; created_at?: string | null; warning?: string };
export type UrlMetrics = { clicks: number; impressions: number; ctr: number; position: number };
export type UrlPerformance = ContentUrl & UrlMetrics & { opportunity: OpportunityLabel };
export type QueryMetric = { query: string; opportunity: OpportunityLabel } & UrlMetrics;
export type DailyMetric = { date: string } & UrlMetrics;


export function classifyGoogleApiError(error: unknown): "invalid_credentials" | "permission_denied" | null {
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown; data?: unknown }; message?: unknown; errors?: unknown };
  const status = Number(candidate?.code ?? candidate?.status ?? candidate?.response?.status ?? 0);
  const message = [
    candidate?.message,
    typeof candidate?.response?.data === "string" ? candidate.response.data : JSON.stringify(candidate?.response?.data ?? ""),
    JSON.stringify(candidate?.errors ?? "")
  ].filter(Boolean).join(" ");

  if (status === 401 || /invalid credentials|invalid[_ ]?grant|unauthorized/i.test(message)) return "invalid_credentials";
  if (status === 403 || /forbidden|permission|insufficient|scope/i.test(message)) return "permission_denied";
  return null;
}

function auth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

export type SheetContentUrlRow = { project: string; url: string; member_name: string; content_worked_at?: string | null; content_type?: string | null };

export function normalizeContentType(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return null;

  if (["audit", "audited", "audit/update", "audit optimization", "url audit"].includes(raw)) {
    return "audit";
  }

  if (["new", "new content", "content mới", "new_content"].includes(raw)) {
    return "new_content";
  }

  if (["update", "updated", "refresh", "content update"].includes(raw)) {
    return "update";
  }

  if (["old", "existing", "portfolio", "stable", "long-standing"].includes(raw)) {
    return "portfolio";
  }

  return raw.replace(/\s+/g, "_");
}

export function parseSheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  // Google Sheets serial date number.
  // Google Sheets day 1 = 1899-12-31, but JS conversion commonly uses 1899-12-30.
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // yyyy-mm-dd
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validDateParts(year, month, day);
  }

  // m/d/yyyy or mm/dd/yyyy
  // Source Sheet uses m/d/yyyy.
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]);
    return validDateParts(year, month, day);
  }

  return null;
}

function validDateParts(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export async function getSheetContentUrlRows(accessToken: string): Promise<SheetContentUrlRow[]> {
  if (!appConfig.sheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: appConfig.sheetId, range: `${appConfig.contentTab}!A:E`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  const rows = result.data.values ?? [];
  return rows.slice(1).map((row) => {
    const [project = "", url = "", member_name = "", content_worked_at = "", content_type = ""] = row as unknown[];
    return { project: String(project), url: String(url), member_name: String(member_name), content_worked_at: parseSheetDate(content_worked_at), content_type: normalizeContentType(content_type) };
  });
}

export async function getContentUrls(accessToken: string): Promise<ContentUrl[]> {
  if (!appConfig.sheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: appConfig.sheetId, range: `${appConfig.contentTab}!A:E`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  const rows = result.data.values ?? [];
  const memberMap = getMemberEmailMap();
  const projectMap = getProjectGscMap();
  return rows.slice(1).map((row, index) => {
    const [project = "", url = "", member_name = "", content_worked_at = "", content_type = ""] = row as unknown[];
    const normalizedProject = String(project);
    const normalizedUrl = String(url);
    const normalizedMemberName = String(member_name);
    const gscProperty = projectMap[normalizedProject];
    return {
      id: String(index),
      project: normalizedProject,
      url: normalizedUrl,
      member_name: normalizedMemberName,
      memberEmail: (memberMap[normalizedMemberName] ?? "").toLowerCase(),
      gscProperty,
      content_worked_at: parseSheetDate(content_worked_at),
      content_type: normalizeContentType(content_type),
      warning: gscProperty ? undefined : `Missing PROJECT_GSC_MAP entry for project: ${normalizedProject}`
    };
  }).filter((row) => row.project && row.url && row.member_name);
}

export function filterRowsForEmail<T extends ContentUrl>(rows: T[], email: string, isAdmin = false): T[] {
  if (isAdmin) return rows;
  return rows.filter((row) => row.memberEmail === email.toLowerCase());
}

function normalize(row: { clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }): UrlMetrics {
  return { clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? 0, position: row.position ?? 0 };
}

export async function searchAnalytics(accessToken: string, siteUrl: string, dimensions: string[], range: DateRange, page?: string, rowLimit = 250) {
  const webmasters = google.searchconsole({ version: "v1", auth: auth(accessToken) });
  const filters = page ? [{ dimension: "page", operator: "equals", expression: page }] : undefined;
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: range.startDate, endDate: range.endDate, dimensions, dimensionFilterGroups: filters ? [{ groupType: "and", filters }] : undefined, type: "web", aggregationType: dimensions.includes("page") ? "byPage" : undefined, rowLimit }
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Search Console request failed";
    return { overview: { ...row, clicks: 0, impressions: 0, ctr: 0, position: 0, opportunity: "no_data" as const, warning: message }, daily: [], queries: [], range, hasData: false, warning: message };
  }
}

export function aggregate(rows: UrlPerformance[]): UrlMetrics {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const position = impressions ? rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}
