import { google } from "googleapis";
import { appConfig } from "../env.ts";
import { reconcileWorkSourceRows, type ReconciliationAliases, type ReconciliationResult, type WorkSourceRow } from "../domain/work-source.ts";

export const slackHeaderAliases: Record<string, string[]> = {
  sourceItemId: ["slack item id", "item id", "slack id", "id"],
  projectRaw: ["project", "project name", "dự án"],
  memberRaw: ["member", "member name", "assignee", "owner", "thực hiện", "người thực hiện"],
  workTypeRaw: ["type", "work type", "content type"],
  sourceStatusRaw: ["status", "source status", "trạng thái"],
  urlRaw: ["url", "content url", "live url", "draft url", "desc/link", "desc / link", "mô tả/link", "link"],
  workDateRaw: ["completed at", "published at", "completion date", "date", "work date", "ngày"],
  difficulty: ["difficulty", "level"],
  adminApproved: ["admin approved", "approved by admin"],
};

const key = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[_\s]+/g, " ");

function parseBoolean(value: unknown) {
  return value === true || ["true", "yes", "y", "1", "approved"].includes(key(value));
}

export function parseSlackListSheet(values: unknown[][]): WorkSourceRow[] {
  if (!values.length) return [];
  const headers = values[0].map(key);
  const indexes = Object.fromEntries(Object.entries(slackHeaderAliases).map(([field, aliases]) => [field, headers.findIndex((header) => aliases.includes(header))]));
  const required = ["sourceItemId", "projectRaw", "memberRaw", "workTypeRaw", "sourceStatusRaw", "urlRaw"];
  const missing = required.filter((field) => indexes[field] < 0);
  if (missing.length) throw new Error(`Slack List sheet is missing required headers: ${missing.join(", ")}`);
  return values.slice(1).map((row, index) => ({
    source: "slack_list_sheet",
    sourceRowNumber: index + 2,
    sourceItemId: String(row[indexes.sourceItemId] ?? "").trim() || null,
    projectRaw: String(row[indexes.projectRaw] ?? ""),
    memberRaw: String(row[indexes.memberRaw] ?? ""),
    workTypeRaw: String(row[indexes.workTypeRaw] ?? ""),
    sourceStatusRaw: String(row[indexes.sourceStatusRaw] ?? ""),
    urlRaw: String(row[indexes.urlRaw] ?? ""),
    workDateRaw: indexes.workDateRaw >= 0 ? row[indexes.workDateRaw] : null,
    difficulty: indexes.difficulty >= 0 ? String(row[indexes.difficulty] ?? "").trim() || null : null,
    adminApproved: indexes.adminApproved >= 0 ? parseBoolean(row[indexes.adminApproved]) : false,
    payload: Object.fromEntries(headers.map((header, cellIndex) => [header || `column_${cellIndex + 1}`, row[cellIndex] ?? null])),
  }));
}

function sheetsAuth(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return oauth2;
}

export async function getSlackListRows(accessToken: string): Promise<WorkSourceRow[]> {
  if (!appConfig.slackListSheetId) return [];
  const sheets = google.sheets({ version: "v4", auth: sheetsAuth(accessToken) });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: appConfig.slackListSheetId,
    range: `${appConfig.slackListTab}!A:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return parseSlackListSheet(result.data.values ?? []);
}

export async function reconcileSlackListSheet(accessToken: string, aliases: ReconciliationAliases = {}): Promise<ReconciliationResult> {
  return reconcileWorkSourceRows(await getSlackListRows(accessToken), aliases);
}
