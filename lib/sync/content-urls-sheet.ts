import { google } from "googleapis";
import { appConfig } from "../env.ts";
import type { WorkSourceRow } from "../domain/work-source.ts";

export const CONTENT_URLS_SOURCE = "content_urls_sheet";
export const CONTENT_URLS_HEADERS = [
  "project",
  "url",
  "member_name",
  "date",
  "type",
] as const;

type ContentHeader = (typeof CONTENT_URLS_HEADERS)[number];

export class ContentSheetContractError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ContentSheetContractError";
    this.code = code;
    this.details = details;
  }
}

const headerKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
const isBlank = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === "";

function validateHeaders(header: unknown[]) {
  const normalized = header.map(headerKey);
  const nonEmpty = normalized.filter(Boolean);
  const duplicates = [
    ...new Set(
      nonEmpty.filter((value, index) => nonEmpty.indexOf(value) !== index),
    ),
  ];
  const missing = CONTENT_URLS_HEADERS.filter(
    (required) => !nonEmpty.includes(required),
  );
  const unknown = [
    ...new Set(
      nonEmpty.filter(
        (value) => !CONTENT_URLS_HEADERS.includes(value as ContentHeader),
      ),
    ),
  ];
  if (
    duplicates.length ||
    missing.length ||
    unknown.length ||
    nonEmpty.length !== CONTENT_URLS_HEADERS.length
  ) {
    throw new ContentSheetContractError(
      "content_sheet_header_invalid",
      `content_urls must contain exactly: ${CONTENT_URLS_HEADERS.join(" | ")}.`,
      { duplicates, missing, unknown, received: nonEmpty },
    );
  }
  return Object.fromEntries(
    CONTENT_URLS_HEADERS.map((name) => [name, normalized.indexOf(name)]),
  ) as Record<ContentHeader, number>;
}

export function parseContentUrlsSheet(values: unknown[][]): WorkSourceRow[] {
  if (!values.length) {
    throw new ContentSheetContractError(
      "content_sheet_empty",
      "content_urls is empty; the required header row was not found.",
    );
  }
  const indexes = validateHeaders(values[0] ?? []);
  return values.slice(1).flatMap((row, index) => {
    if (row.every(isBlank)) return [];
    const payload = Object.fromEntries(
      CONTENT_URLS_HEADERS.map((name) => [name, row[indexes[name]] ?? null]),
    );
    return [
      {
        source: CONTENT_URLS_SOURCE,
        sourceRowNumber: index + 2,
        sourceItemId: null,
        projectRaw: String(row[indexes.project] ?? ""),
        urlRaw: String(row[indexes.url] ?? ""),
        memberRaw: String(row[indexes.member_name] ?? ""),
        workDateRaw: row[indexes.date] ?? null,
        workTypeRaw: String(row[indexes.type] ?? ""),
        sourceStatusRaw: "Completed",
        payload,
      } satisfies WorkSourceRow,
    ];
  });
}

function sheetsAuth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

function quotedTab(tab: string) {
  return `'${tab.replace(/'/g, "''")}'`;
}

export async function getContentUrlsSheetRows(
  accessToken: string,
): Promise<WorkSourceRow[]> {
  if (!appConfig.sheetId) {
    throw new ContentSheetContractError(
      "content_sheet_id_missing",
      "GOOGLE_SHEET_ID is required for Content Sheet sync.",
    );
  }
  if (!appConfig.contentTab) {
    throw new ContentSheetContractError(
      "content_sheet_tab_missing",
      "GOOGLE_SHEET_TAB is required for Content Sheet sync.",
    );
  }
  const sheets = google.sheets({
    version: "v4",
    auth: sheetsAuth(accessToken),
  });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.sheetId,
    range: `${quotedTab(appConfig.contentTab)}!A:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return parseContentUrlsSheet(result.data.values ?? []);
}
