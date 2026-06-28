import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

type Counts = {
  activeUrls: number;
  missingUrlHash: number;
  missingGscProperty: number;
  missingMemberEmail: number;
  refreshJobs: number;
  refreshJobItems: number;
  urlPerformanceSnapshots: number;
  memberPerformanceSnapshots: number;
};

const REQUIRED_SCHEMA: Record<string, string[]> = {
  content_urls: [
    "id",
    "url_hash",
    "project",
    "url",
    "member_name",
    "member_email",
    "gsc_property",
    "is_active",
    "source",
    "first_seen_at",
    "last_seen_at",
    "created_at",
    "updated_at",
  ],
  refresh_jobs: [
    "id",
    "status",
    "job_type",
    "triggered_by",
    "scope",
    "range_key",
    "start_date",
    "end_date",
    "previous_start_date",
    "previous_end_date",
    "total_urls",
    "processed_urls",
    "failed_urls",
    "urls_with_data",
    "no_data_urls",
    "started_at",
    "finished_at",
    "last_processed_at",
    "error_message",
    "created_at",
    "updated_at",
  ],
  refresh_job_items: [
    "id",
    "job_id",
    "refresh_job_id",
    "content_url_id",
    "url_hash",
    "project",
    "url",
    "member_name",
    "member_email",
    "gsc_property",
    "status",
    "attempts",
    "error_message",
    "processed_at",
    "created_at",
    "updated_at",
  ],
  url_performance_snapshots: [
    "id",
    "content_url_id",
    "url_hash",
    "project",
    "url",
    "member_name",
    "member_email",
    "gsc_property",
    "range_key",
    "start_date",
    "end_date",
    "previous_start_date",
    "previous_end_date",
    "clicks",
    "impressions",
    "ctr",
    "position",
    "previous_clicks",
    "previous_impressions",
    "previous_ctr",
    "previous_position",
    "click_delta",
    "click_growth_pct",
    "impression_delta",
    "impression_growth_pct",
    "ctr_delta",
    "position_delta",
    "growth_status",
    "opportunity_status",
    "recommendation",
    "snapshot_week",
    "refreshed_at",
    "created_at",
    "updated_at",
  ],
  member_performance_snapshots: [
    "id",
    "member_name",
    "member_email",
    "range_key",
    "start_date",
    "end_date",
    "previous_start_date",
    "previous_end_date",
    "url_count",
    "urls_with_data",
    "growing_urls",
    "stable_urls",
    "declining_urls",
    "no_data_urls",
    "ctr_opportunity_urls",
    "ranking_opportunity_urls",
    "clicks",
    "impressions",
    "ctr",
    "position",
    "previous_clicks",
    "previous_impressions",
    "click_delta",
    "click_growth_pct",
    "impression_delta",
    "impression_growth_pct",
    "quantity_index",
    "quality_index",
    "support_signal",
    "main_strength",
    "main_risk",
    "suggested_support",
    "snapshot_week",
    "refreshed_at",
    "created_at",
    "updated_at",
  ],
  sync_runs: [
    "id",
    "source",
    "status",
    "total_rows",
    "inserted_rows",
    "updated_rows",
    "deactivated_rows",
    "failed_rows",
    "triggered_by",
    "error_message",
    "started_at",
    "finished_at",
    "created_at",
  ],
};

const JSON_HEADERS = {
  "Cache-Control": "no-store",
};

function json(payload: unknown, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: JSON_HEADERS,
  });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]")
    .replace(/(password=)[^\s&]+/gi, "$1[redacted]")
    .replace(/(DATABASE_URL=)[^\s]+/gi, "$1[redacted]");
}

async function tableColumns(tableName: string): Promise<Set<string>> {
  const result = await query<{ column_name: string }>(
    `
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function safeCount(sql: string): Promise<number> {
  try {
    const result = await query<{ count: string | number }>(sql);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function loadCounts(): Promise<Counts> {
  const [
    activeUrls,
    missingUrlHash,
    missingGscProperty,
    missingMemberEmail,
    refreshJobs,
    refreshJobItems,
    urlPerformanceSnapshots,
    memberPerformanceSnapshots,
  ] = await Promise.all([
    safeCount("select count(*) from public.content_urls where is_active = true"),
    safeCount(
      "select count(*) from public.content_urls where is_active = true and (url_hash is null or url_hash = '')"
    ),
    safeCount(
      "select count(*) from public.content_urls where is_active = true and (gsc_property is null or gsc_property = '')"
    ),
    safeCount(
      "select count(*) from public.content_urls where is_active = true and (member_email is null or member_email = '')"
    ),
    safeCount("select count(*) from public.refresh_jobs"),
    safeCount("select count(*) from public.refresh_job_items"),
    safeCount("select count(*) from public.url_performance_snapshots"),
    safeCount("select count(*) from public.member_performance_snapshots"),
  ]);

  return {
    activeUrls,
    missingUrlHash,
    missingGscProperty,
    missingMemberEmail,
    refreshJobs,
    refreshJobItems,
    urlPerformanceSnapshots,
    memberPerformanceSnapshots,
  };
}

export async function GET() {
  try {
    await query("select 1");

    const missing: string[] = [];

    for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
      const columns = await tableColumns(table);

      if (columns.size === 0) {
        missing.push(`${table}.*`);
        continue;
      }

      for (const column of requiredColumns) {
        if (!columns.has(column)) {
          missing.push(`${table}.${column}`);
        }
      }
    }

    const schemaOk = missing.length === 0;

    if (!schemaOk) {
      return json(
        {
          ok: false,
          database: {
            connected: true,
          },
          schema: {
            ok: false,
            missing,
          },
          counts: {},
        },
        503
      );
    }

    return json(
      {
        ok: true,
        database: {
          connected: true,
        },
        counts: await loadCounts(),
        schema: {
          ok: true,
          missing: [],
        },
      },
      200
    );
  } catch (error) {
    return json(
      {
        ok: false,
        database: {
          connected: false,
        },
        error: "Database connection failed",
        details: safeErrorMessage(error),
      },
      500
    );
  }
}
