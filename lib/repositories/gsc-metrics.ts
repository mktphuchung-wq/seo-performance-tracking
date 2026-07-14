import { transaction } from "../db";
import type { GscDailyFetchRow } from "../google";

export async function persistGscFetchRun(input: { runKey: string; dataCutoff: string; rows: GscDailyFetchRow[]; startedAt?: string }) {
  return transaction(async (client) => {
    const properties = new Set(input.rows.map((row) => row.gscProperty).filter(Boolean));
    const succeeded = new Set(input.rows.filter((row) => row.gscProperty && row.status !== "unknown").map((row) => row.gscProperty));
    const failed = new Set(input.rows.filter((row) => row.gscProperty && row.status === "unknown").map((row) => row.gscProperty));
    const status = failed.size === 0 ? "completed" : succeeded.size ? "partial" : "failed";
    const run = await client.query(`insert into public.gsc_fetch_runs
      (run_key,status,data_cutoff,latest_complete_date,properties_total,properties_succeeded,properties_failed,diagnostics,started_at,finished_at,updated_at)
      values($1,$2,$3,$3,$4,$5,$6,$7::jsonb,coalesce($8::timestamptz,now()),now(),now())
      on conflict(run_key) do update set status=excluded.status,data_cutoff=excluded.data_cutoff,
      latest_complete_date=excluded.latest_complete_date,properties_total=excluded.properties_total,
      properties_succeeded=excluded.properties_succeeded,properties_failed=excluded.properties_failed,
      diagnostics=excluded.diagnostics,finished_at=now(),updated_at=now() returning id::text`, [input.runKey,status,input.dataCutoff,properties.size,succeeded.size,failed.size,JSON.stringify({ rowCount: input.rows.length, unknownRows: input.rows.filter((row) => row.status === "unknown").length }),input.startedAt ?? null]);
    const runId = run.rows[0].id;
    for (const row of input.rows) {
      if (!row.gscProperty) continue;
      await client.query(`insert into public.gsc_url_daily_metrics
        (fetch_run_id,gsc_property,canonical_url,metric_date,search_type,data_status,clicks,impressions,ctr,position,error_message,created_at,updated_at)
        values($1,$2,$3,$4,'web',$5,$6,$7,$8,$9,$10,now(),now())
        on conflict(gsc_property,canonical_url,metric_date,search_type) do update set fetch_run_id=excluded.fetch_run_id,
        data_status=excluded.data_status,clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,
        position=excluded.position,error_message=excluded.error_message,updated_at=now()`, [runId,row.gscProperty,row.canonicalUrl,row.date,row.status,row.clicks,row.impressions,row.ctr,row.position,row.error ?? null]);
    }
    return { runId, status, propertiesTotal: properties.size, propertiesSucceeded: succeeded.size, propertiesFailed: failed.size, rows: input.rows.length };
  });
}

export async function loadGscWindowMetrics(input: { urls: string[]; startDate: string; endDate: string }) {
  if (!input.urls.length) return [];
  const { query } = await import("../db");
  const result = await query(`select canonical_url,metric_date::text,data_status,clicks,impressions,ctr,position
    from public.gsc_url_daily_metrics where canonical_url=any($1::text[]) and metric_date between $2 and $3
    order by canonical_url,metric_date`, [input.urls,input.startDate,input.endDate]);
  return result.rows;
}
