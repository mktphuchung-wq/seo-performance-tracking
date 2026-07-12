import { query } from "../db";
import { canCreateSheetWorkEvent, isWorkType, sheetWorkEventSourceRowKey, type WorkType } from "../domain/work-events";
import { classifyGoogleApiError, getSheetContentUrlRows } from "../google";
import { getMemberEmailMap, getProjectGscMap } from "../env";
import { deactivateMissingSheetContentUrls, upsertCanonicalContentUrl } from "../repositories/content-urls";
import { upsertUrlWorkEvent } from "../repositories/url-work-events";

export type SheetSyncDateStats = {
  totalRows: number;
  parsedContentWorkedAtRows: number;
  missingContentWorkedAtRows: number;
  minContentWorkedAt: string | null;
  maxContentWorkedAt: string | null;
  workedMonthDistribution: Record<string, number>;
};

export type SheetSyncResult = {
  status: "success" | "failed";
  totalRows: number;
  urlRowsProcessed: number;
  insertedRows: number;
  updatedRows: number;
  deactivatedRows: number;
  failedRows: number;
  workEventsInserted: number;
  workEventsUpdated: number;
  duplicateWorkEventsSkipped: number;
  missingWorkDates: number;
  missingWorkTypes: number;
  typeDistribution: Record<string, number>;
  dateStats?: SheetSyncDateStats;
  rows_with_type?: number;
  rows_missing_type?: number;
  type_distribution?: Record<string, number>;
  errorMessage?: string;
};

function normalizeSheetUrl(value: string): string {
  const parsed = new URL(value.trim());
  parsed.hash = "";
  return parsed.toString();
}

function buildSheetSyncDateStats(rows: { content_worked_at?: string | null }[]): SheetSyncDateStats {
  const parsedDates = rows.map((row) => row.content_worked_at).filter((date): date is string => Boolean(date));
  const workedMonthDistribution = parsedDates.reduce<Record<string, number>>((acc, date) => {
    const month = date.slice(0, 7);
    acc[month] = (acc[month] ?? 0) + 1;
    return acc;
  }, {});
  return {
    totalRows: rows.length,
    parsedContentWorkedAtRows: parsedDates.length,
    missingContentWorkedAtRows: rows.length - parsedDates.length,
    minContentWorkedAt: parsedDates.length ? parsedDates.reduce((min, date) => date < min ? date : min, parsedDates[0]) : null,
    maxContentWorkedAt: parsedDates.length ? parsedDates.reduce((max, date) => date > max ? date : max, parsedDates[0]) : null,
    workedMonthDistribution,
  };
}

async function recordSheetSyncRun(result: SheetSyncResult) {
  await query(`insert into sync_runs (source, status, total_rows, inserted_rows, updated_rows, deactivated_rows, failed_rows, error_message, created_at, finished_at)
    values ('google_sheet',$1,$2,$3,$4,$5,$6,$7,now(),now())`,
    [result.status, result.totalRows, result.insertedRows, result.updatedRows, result.deactivatedRows, result.failedRows, result.errorMessage ?? null]);
}

export async function syncSheetToDb(accessToken: string): Promise<SheetSyncResult> {
  const result: SheetSyncResult = {
    status: "success",
    totalRows: 0,
    urlRowsProcessed: 0,
    insertedRows: 0,
    updatedRows: 0,
    deactivatedRows: 0,
    failedRows: 0,
    workEventsInserted: 0,
    workEventsUpdated: 0,
    duplicateWorkEventsSkipped: 0,
    missingWorkDates: 0,
    missingWorkTypes: 0,
    typeDistribution: {},
  };

  try {
    const rows = await getSheetContentUrlRows(accessToken);
    const memberMap = getMemberEmailMap();
    const projectMap = getProjectGscMap();
    const activeContentUrlIds = new Set<string>();

    result.totalRows = rows.length;
    result.dateStats = buildSheetSyncDateStats(rows);
    result.missingWorkDates = result.dateStats.missingContentWorkedAtRows;
    result.typeDistribution = rows.reduce<Record<string, number>>((acc, row) => {
      const type = row.content_type || "missing";
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    result.missingWorkTypes = rows.filter((row) => !isWorkType(row.content_type)).length;
    result.rows_with_type = rows.length - result.missingWorkTypes;
    result.rows_missing_type = result.missingWorkTypes;
    result.type_distribution = result.typeDistribution;

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

      const memberEmail = (memberMap[memberName] ?? "").toLowerCase();
      const contentUrl = await upsertCanonicalContentUrl({
        project,
        normalizedUrl,
        memberName,
        memberEmail,
        gscProperty: projectMap[project] ?? null,
        contentWorkedAt: row.content_worked_at || null,
        contentType: row.content_type || null,
      });
      activeContentUrlIds.add(contentUrl.id);
      result.urlRowsProcessed += 1;
      if (contentUrl.outcome === "inserted") result.insertedRows += 1;
      if (contentUrl.outcome === "updated") result.updatedRows += 1;

      if (!canCreateSheetWorkEvent(row.content_worked_at, row.content_type)) continue;
      const workType: WorkType = row.content_type;
      const workDate = row.content_worked_at!;
      const eventOutcome = await upsertUrlWorkEvent({
        contentUrlId: contentUrl.id,
        project,
        memberName,
        memberEmail,
        workType,
        workDate,
        source: "google_sheet",
        sourceRowKey: sheetWorkEventSourceRowKey({ project, normalizedUrl, memberName, workDate, workType }),
        status: "completed",
      });
      if (eventOutcome === "inserted") result.workEventsInserted += 1;
      if (eventOutcome === "updated") result.workEventsUpdated += 1;
      if (eventOutcome === "skipped") result.duplicateWorkEventsSkipped += 1;
    }

    const deactivated = await deactivateMissingSheetContentUrls([...activeContentUrlIds]);
    result.deactivatedRows = deactivated.rowCount ?? 0;
    console.info("Google Sheet URL/work-event sync diagnostics", result);
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
