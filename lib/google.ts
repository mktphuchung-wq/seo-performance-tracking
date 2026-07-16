import { google } from "googleapis";
import { appConfig, getMemberEmailMap, getProjectGscMap } from "./env";
import { getDateRange, type DateRange } from "./dates";
import { classifyOpportunity, type OpportunityLabel } from "./metrics";
import { normalizeWorkType, parseSourceDate } from "./domain/normalization";
import { parseLegacyContentSheet } from "./sync/legacy-content-sheet";

export type ContentUrl = {
  id: string;
  urlHash?: string;
  project: string;
  url: string;
  member_name: string;
  memberEmail: string;
  gscProperty?: string;
  content_worked_at?: string | null;
  content_type?: string | null;
  last_updated_at?: string | null;
  created_at?: string | null;
  warning?: string;
};
export type UrlMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
export type UrlPerformance = ContentUrl &
  UrlMetrics & { opportunity: OpportunityLabel };
export type QueryMetric = {
  query: string;
  opportunity: OpportunityLabel;
} & UrlMetrics;
export type DailyMetric = { date: string } & UrlMetrics;

export function classifyGoogleApiError(
  error: unknown,
): "invalid_credentials" | "permission_denied" | null {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown; data?: unknown };
    message?: unknown;
    errors?: unknown;
  };
  const status = Number(
    candidate?.code ?? candidate?.status ?? candidate?.response?.status ?? 0,
  );
  const message = [
    candidate?.message,
    typeof candidate?.response?.data === "string"
      ? candidate.response.data
      : JSON.stringify(candidate?.response?.data ?? ""),
    JSON.stringify(candidate?.errors ?? ""),
  ]
    .filter(Boolean)
    .join(" ");

  if (
    status === 401 ||
    /invalid credentials|invalid[_ ]?grant|unauthorized/i.test(message)
  )
    return "invalid_credentials";
  if (
    status === 403 ||
    /forbidden|permission|insufficient|scope/i.test(message)
  )
    return "permission_denied";
  return null;
}

function auth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

export type SheetContentUrlRow = {
  project: string;
  url: string;
  member_name: string;
  content_worked_at?: string | null;
  content_type?: string | null;
};

export function normalizeContentType(value: unknown): string | null {
  return normalizeWorkType(value);
  /* Retained below only as commented legacy source compatibility.
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

  return raw.replace(/\s+/g, "_"); */
}

export function parseSheetDate(value: unknown): string | null {
  return parseSourceDate(value);
  /* Retained below only as commented legacy source compatibility.
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

  return null; */
}

function validDateParts(
  year: number,
  month: number,
  day: number,
): string | null {
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

export async function getSheetContentUrlRows(
  accessToken: string,
): Promise<SheetContentUrlRow[]> {
  if (!appConfig.sheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.sheetId,
    range: `${appConfig.contentTab}!A:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return parseLegacyContentSheet(result.data.values ?? []).map(
    ({ source_row_number: _sourceRowNumber, ...row }) => row,
  );
}

export async function getContentUrls(
  accessToken: string,
): Promise<ContentUrl[]> {
  if (!appConfig.sheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: auth(accessToken) });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.sheetId,
    range: `${appConfig.contentTab}!A:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = parseLegacyContentSheet(result.data.values ?? []);
  const memberMap = getMemberEmailMap();
  const projectMap = getProjectGscMap();
  return rows
    .map((row, index) => {
      const normalizedProject = row.project;
      const normalizedUrl = row.url;
      const normalizedMemberName = row.member_name;
      const gscProperty = projectMap[normalizedProject];
      return {
        id: String(index),
        project: normalizedProject,
        url: normalizedUrl,
        member_name: normalizedMemberName,
        memberEmail: (memberMap[normalizedMemberName] ?? "").toLowerCase(),
        gscProperty,
        content_worked_at: row.content_worked_at,
        content_type: row.content_type,
        warning: gscProperty
          ? undefined
          : `Missing PROJECT_GSC_MAP entry for project: ${normalizedProject}`,
      };
    })
    .filter((row) => row.project && row.url && row.member_name);
}

export function filterRowsForEmail<T extends ContentUrl>(
  rows: T[],
  email: string,
  isAdmin = false,
): T[] {
  if (isAdmin) return rows;
  return rows.filter((row) => row.memberEmail === email.toLowerCase());
}

function normalize(row: {
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}): UrlMetrics {
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

export async function searchAnalytics(
  accessToken: string,
  siteUrl: string,
  dimensions: string[],
  range: DateRange,
  page?: string,
  rowLimit = 250,
) {
  const webmasters = google.searchconsole({
    version: "v1",
    auth: auth(accessToken),
  });
  const filters = page
    ? [{ dimension: "page", operator: "equals", expression: page }]
    : undefined;
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions,
      dimensionFilterGroups: filters
        ? [{ groupType: "and", filters }]
        : undefined,
      type: "web",
      aggregationType: dimensions.includes("page") ? "byPage" : undefined,
      rowLimit,
    },
  });
  return res.data.rows ?? [];
}

export async function getUrlPerformance(
  rows: ContentUrl[],
  accessToken: string,
  range = getDateRange(),
): Promise<UrlPerformance[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.gscProperty)
        return {
          ...row,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          opportunity: "no_data" as const,
        };
      try {
        const data = await searchAnalytics(
          accessToken,
          row.gscProperty,
          ["page"],
          range,
          row.url,
          1,
        );
        const metrics = normalize(data[0] ?? {});
        return {
          ...row,
          ...metrics,
          opportunity: classifyOpportunity(metrics),
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Google Search Console request failed";
        return {
          ...row,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
          opportunity: "no_data" as const,
          warning: message,
        };
      }
    }),
  );
}

export async function getUrlDetail(
  row: ContentUrl,
  accessToken: string,
  range = getDateRange(),
) {
  if (!row.gscProperty)
    return {
      overview: {
        ...row,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
        opportunity: "no_data" as const,
      },
      daily: [],
      queries: [],
      range,
      hasData: false,
      warning: row.warning,
    };
  try {
    const [overviewRows, dailyRows, queryRows] = await Promise.all([
      searchAnalytics(
        accessToken,
        row.gscProperty,
        ["page"],
        range,
        row.url,
        1,
      ),
      searchAnalytics(
        accessToken,
        row.gscProperty,
        ["date"],
        range,
        row.url,
        500,
      ),
      searchAnalytics(
        accessToken,
        row.gscProperty,
        ["query"],
        range,
        row.url,
        250,
      ),
    ]);
    const overviewMetrics = normalize(overviewRows[0] ?? {});
    const queries = queryRows.map((r) => {
      const metrics = normalize(r);
      return {
        query: String(r.keys?.[0] ?? ""),
        ...metrics,
        opportunity: classifyOpportunity(metrics),
      };
    });
    return {
      overview: {
        ...row,
        ...overviewMetrics,
        opportunity: classifyOpportunity(overviewMetrics),
      },
      daily: dailyRows.map((r) => ({
        date: String(r.keys?.[0] ?? ""),
        ...normalize(r),
      })),
      queries,
      ctrOpportunities: queries.filter(
        (q) => q.opportunity === "ctr_opportunity",
      ),
      rankingOpportunities: queries
        .filter((q) => q.opportunity === "ranking_opportunity")
        .sort((a, b) => b.impressions - a.impressions),
      winningQueries: queries
        .filter((q) => q.opportunity === "winner")
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10),
      range,
      hasData: overviewRows.length > 0,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Search Console request failed";
    return {
      overview: {
        ...row,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
        opportunity: "no_data" as const,
        warning: message,
      },
      daily: [],
      queries: [],
      range,
      hasData: false,
      warning: message,
    };
  }
}

export function aggregate(rows: UrlPerformance[]): UrlMetrics {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const position = impressions
    ? rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / impressions
    : 0;
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
  };
}

export async function listSearchConsoleProperties(accessToken: string) {
  const webmasters = google.searchconsole({
    version: "v1",
    auth: auth(accessToken),
  });
  const result = await webmasters.sites.list();
  return (result.data.siteEntry ?? [])
    .map((entry) => ({
      siteUrl: String(entry.siteUrl ?? ""),
      permissionLevel: String(entry.permissionLevel ?? ""),
    }))
    .filter((entry) => entry.siteUrl);
}

export async function testSearchConsolePropertyAccess(input: {
  accessToken: string;
  siteUrl: string;
}) {
  const properties = await listSearchConsoleProperties(input.accessToken);
  const property = properties.find((row) => row.siteUrl === input.siteUrl) ?? null;
  if (!property)
    return {
      property: null,
      accessStatus: "not_accessible" as const,
      testQueryStatus: "not_run" as const,
      errorCode: "property_not_accessible",
      queryRows: 0,
    };
  if (property.permissionLevel === "siteUnverifiedUser")
    return {
      property,
      accessStatus: "unverified_permission" as const,
      testQueryStatus: "not_run" as const,
      errorCode: "site_unverified_user",
      queryRows: 0,
    };
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const webmasters = google.searchconsole({
    version: "v1",
    auth: auth(input.accessToken),
  });
  try {
    const response = await webmasters.searchanalytics.query({
      siteUrl: input.siteUrl,
      requestBody: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["date"],
        type: "web",
        rowLimit: 1,
      },
    });
    return {
      property,
      accessStatus: "verified" as const,
      testQueryStatus: "succeeded" as const,
      errorCode: null,
      queryRows: response.data.rows?.length ?? 0,
    };
  } catch (error) {
    return {
      property,
      accessStatus: "query_failed" as const,
      testQueryStatus: "failed" as const,
      errorCode:
        classifyGoogleApiError(error) ??
        (error instanceof Error ? error.message : "property_test_failed"),
      queryRows: 0,
    };
  }
}

export type TrackedGscUrl = {
  project: string;
  gscProperty: string | null;
  canonicalUrl: string;
};
export type GscDailyFetchRow = {
  project: string;
  gscProperty: string | null;
  canonicalUrl: string;
  date: string;
  status: "observed" | "observed_zero" | "unknown";
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  error?: string | null;
};

function dateKeys(range: DateRange) {
  const keys: string[] = [];
  const cursor = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export async function searchAnalyticsPaged(
  accessToken: string,
  siteUrl: string,
  dimensions: string[],
  range: DateRange,
  page?: string,
  rowLimit = 25_000,
) {
  const webmasters = google.searchconsole({
    version: "v1",
    auth: auth(accessToken),
  });
  const rows: any[] = [];
  let startRow = 0;
  while (true) {
    const filters = page
      ? [{ dimension: "page", operator: "equals", expression: page }]
      : undefined;
    const response = await webmasters.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions,
        dimensionFilterGroups: filters
          ? [{ groupType: "and", filters }]
          : undefined,
        type: "web",
        aggregationType: dimensions.includes("page") ? "byPage" : undefined,
        rowLimit,
        startRow,
      },
    });
    const pageRows = response.data.rows ?? [];
    rows.push(...pageRows);
    if (pageRows.length < rowLimit) break;
    startRow += pageRows.length;
  }
  return rows;
}

export async function fetchTrackedGscDaily(
  rows: TrackedGscUrl[],
  accessToken: string,
  range: DateRange,
): Promise<GscDailyFetchRow[]> {
  const output: GscDailyFetchRow[] = [];
  const dates = dateKeys(range);
  const properties = new Map<string, TrackedGscUrl[]>();
  for (const row of rows) {
    if (!row.gscProperty) {
      output.push(
        ...dates.map((date) => ({
          ...row,
          date,
          status: "unknown" as const,
          clicks: null,
          impressions: null,
          ctr: null,
          position: null,
          error: "gsc_property_missing",
        })),
      );
      continue;
    }
    (
      properties.get(row.gscProperty) ??
      properties.set(row.gscProperty, []).get(row.gscProperty)!
    ).push(row);
  }
  for (const [gscProperty, tracked] of properties) {
    try {
      const bulk = await searchAnalyticsPaged(
        accessToken,
        gscProperty,
        ["page", "date"],
        range,
      );
      const byUrlDate = new Map(
        bulk.map((metric) => [
          `${String(metric.keys?.[0] ?? "")}|${String(metric.keys?.[1] ?? "")}`,
          metric,
        ]),
      );
      for (const trackedUrl of tracked) {
        const hasBulk = dates.some((date) =>
          byUrlDate.has(`${trackedUrl.canonicalUrl}|${date}`),
        );
        let exact: any[] = [];
        let exactError: string | null = null;
        if (!hasBulk) {
          try {
            exact = await searchAnalyticsPaged(
              accessToken,
              gscProperty,
              ["date"],
              range,
              trackedUrl.canonicalUrl,
            );
          } catch (error) {
            exactError =
              error instanceof Error
                ? error.message
                : "exact_page_fetch_failed";
          }
        }
        const exactByDate = new Map(
          exact.map((metric) => [String(metric.keys?.[0] ?? ""), metric]),
        );
        for (const date of dates) {
          const metric =
            byUrlDate.get(`${trackedUrl.canonicalUrl}|${date}`) ??
            exactByDate.get(date);
          if (metric)
            output.push({
              ...trackedUrl,
              date,
              status: "observed",
              clicks: Number(metric.clicks ?? 0),
              impressions: Number(metric.impressions ?? 0),
              ctr: Number(metric.ctr ?? 0),
              position: Number(metric.position ?? 0),
            });
          else if (exactError)
            output.push({
              ...trackedUrl,
              date,
              status: "unknown",
              clicks: null,
              impressions: null,
              ctr: null,
              position: null,
              error: exactError,
            });
          else
            output.push({
              ...trackedUrl,
              date,
              status: "observed_zero",
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: null,
            });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "property_fetch_failed";
      for (const trackedUrl of tracked)
        output.push(
          ...dates.map((date) => ({
            ...trackedUrl,
            date,
            status: "unknown" as const,
            clicks: null,
            impressions: null,
            ctr: null,
            position: null,
            error: message,
          })),
        );
    }
  }
  return output;
}
