import { transaction, type Queryable } from "../db";
import { canonicalContentUrlHash } from "../domain/work-events";
import type { NormalizedWorkSourceRow, ReconciliationResult } from "../domain/work-source";

export type PersistedReconciliation = ReconciliationResult["diagnostics"] & {
  syncRunId: string;
  persistenceMode: "raw_only" | "canonical_events";
  eventsInserted: number;
  eventsUpdated: number;
};

async function resolveUnitRule(client: Queryable, row: NormalizedWorkSourceRow) {
  const result = await client.query(`select id,unit_value,rule_version from public.kpi_work_unit_rules
    where is_active=true and work_type=$1 and difficulty=$2
      and (project is null or project=$3) and (member_name is null or member_name=$4)
    order by (member_name is not null)::int desc,(project is not null)::int desc,valid_from desc,id desc limit 1`,
  [row.workType, row.difficulty || (row.workType === "audit" || row.workType === "update" ? "basic" : "normal"), row.project, row.member]);
  return result.rows[0] ?? null;
}

async function persistCanonicalEvent(client: Queryable, row: NormalizedWorkSourceRow) {
  if (!row.project || !row.member || !row.workType || !row.workDate || !row.canonicalUrl) return "skipped";
  const projectIdentity=await client.query(`insert into public.projects(canonical_name) values($1)
    on conflict(canonical_name) do update set updated_at=now() returning id::text,gsc_ready,kpi_ready,gsc_property`,[row.project]);
  const memberIdentity=await client.query(`insert into public.members(canonical_name) values($1)
    on conflict(canonical_name) do update set updated_at=now() returning id::text`,[row.member]);
  const hash = canonicalContentUrlHash(row.project, row.canonicalUrl);
  const normalizedDomain=new URL(row.canonicalUrl).hostname.toLowerCase().replace(/^www\./,"");
  const contentUrl = await client.query(`insert into public.content_urls
    (url_hash,project_id,project,url,normalized_domain,classification_status,classification_issues,classification_version,gsc_ready,gsc_property,
     member_name,member_email,content_worked_at,content_type,is_active,source,first_seen_at,last_seen_at,created_at,updated_at)
    values ($1,$2,$3,$4,$5,'accepted','[]'::jsonb,'source_pipeline_v1',$6,$7,$8,'',$9,$10,true,$11,now(),now(),now(),now())
    on conflict (url_hash) do update set project_id=excluded.project_id,normalized_domain=excluded.normalized_domain,
      classification_status='accepted',classification_issues='[]'::jsonb,classification_version='source_pipeline_v1',
      gsc_ready=excluded.gsc_ready,gsc_property=excluded.gsc_property,is_active=true,last_seen_at=now(),updated_at=now()
    returning id::text`, [hash,projectIdentity.rows[0].id,row.project,row.canonicalUrl,normalizedDomain,
      Boolean(projectIdentity.rows[0].gsc_ready),projectIdentity.rows[0].gsc_property??null,row.member,row.workDate,row.workType,row.source]);
  const rule = await resolveUnitRule(client, row);
  const sourceRowKey = row.sourceItemId ? null : row.logicalKey;
  const existing = await client.query(`select id from public.url_work_events where source=$1 and
    (($2::text is not null and source_item_id=$2) or ($2::text is null and source_row_key=$3)) limit 1`, [row.source, row.sourceItemId, sourceRowKey]);
  if(existing.rowCount&& !row.sourceItemId){
    await client.query(`update public.url_work_events set content_url_id=$2,project_id=$3,member_id=$4,project=$5,member_name=$6,
      work_type=$7,work_date=$8,difficulty=$9,unit_value=$10,source_status=$11,source_url=$12,canonical_url_snapshot=$13,
      completed_at=$8,date_confidence=$14,difficulty_source=$15,unit_rule_id=$16,unit_rule_version=$17,is_countable=$18,
      kpi_ready=$19,readiness_issues=$20::jsonb,exclusion_reason=$21,status=$22,note=$23,updated_at=now() where id=$1`,[existing.rows[0].id,contentUrl.rows[0].id,
      projectIdentity.rows[0].id,memberIdentity.rows[0].id,row.project,row.member,row.workType,row.workDate,
      row.difficulty || (row.workType === "audit" || row.workType === "update" ? "basic" : "normal"),Number(rule?.unit_value ?? 0),
      row.sourceStatusRaw,row.urlRaw,row.canonicalUrl,row.dateConfidence,row.difficulty ? "source" : "default",rule?.id ?? null,
      rule?.rule_version ?? "kpi_v2",row.isCountable,Boolean(projectIdentity.rows[0].kpi_ready)&&row.isCountable,
      JSON.stringify(Boolean(projectIdentity.rows[0].kpi_ready)?row.issues:[...row.issues,"project_not_kpi_ready"]),
      row.isCountable ? null : row.issues.join(",") || "not_eligible",row.status,row.issues.join(",") || null]);
    return "updated";
  }
  await client.query(`insert into public.url_work_events
    (content_url_id,project_id,member_id,project,member_name,member_email,work_type,work_date,difficulty,unit_value,source,source_row_key,
     source_item_id,source_status,source_url,canonical_url_snapshot,completed_at,date_confidence,difficulty_source,
     unit_rule_id,unit_rule_version,is_countable,kpi_ready,readiness_issues,exclusion_reason,status,note,created_at,updated_at)
    values ($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$7,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,now(),now())
    on conflict (source,source_item_id) where source_item_id is not null do update set
      content_url_id=excluded.content_url_id,project_id=excluded.project_id,member_id=excluded.member_id,project=excluded.project,member_name=excluded.member_name,work_type=excluded.work_type,
      work_date=excluded.work_date,difficulty=excluded.difficulty,unit_value=excluded.unit_value,source_status=excluded.source_status,
      source_url=excluded.source_url,canonical_url_snapshot=excluded.canonical_url_snapshot,date_confidence=excluded.date_confidence,
      unit_rule_id=excluded.unit_rule_id,unit_rule_version=excluded.unit_rule_version,is_countable=excluded.is_countable,
      kpi_ready=excluded.kpi_ready,readiness_issues=excluded.readiness_issues,exclusion_reason=excluded.exclusion_reason,
      status=excluded.status,note=excluded.note,updated_at=now()`, [
    contentUrl.rows[0].id,projectIdentity.rows[0].id,memberIdentity.rows[0].id,row.project,row.member,row.workType,row.workDate,
    row.difficulty || (row.workType === "audit" || row.workType === "update" ? "basic" : "normal"),
    Number(rule?.unit_value ?? 0), row.source, sourceRowKey, row.sourceItemId, row.sourceStatusRaw, row.urlRaw,
    row.canonicalUrl, row.dateConfidence, row.difficulty ? "source" : "default", rule?.id ?? null,
    rule?.rule_version ?? "kpi_v2", row.isCountable, Boolean(projectIdentity.rows[0].kpi_ready)&&row.isCountable,
    JSON.stringify(Boolean(projectIdentity.rows[0].kpi_ready)?row.issues:[...row.issues,"project_not_kpi_ready"]),
    row.isCountable ? null : row.issues.join(",") || "not_eligible", row.status, row.issues.join(",") || null,
  ]);
  return existing.rowCount ? "updated" : "inserted";
}

export async function persistWorkSourceReconciliation(
  result: ReconciliationResult,
  actor: string,
  options: { persistEvents?: boolean; approvalReason?: string | null } = {},
): Promise<PersistedReconciliation> {
  return transaction(async (client) => {
    const persistenceMode = options.persistEvents ? "canonical_events" : "raw_only";
    const diagnostics = { ...result.diagnostics, persistenceMode, approvalReason: options.approvalReason ?? null };
    const run = await client.query(`insert into public.work_sync_runs
      (source,status,workflow_stage,raw_row_count,logical_item_count,quarantined_count,duplicate_variant_count,diagnostics,
       triggered_by,approval_reason,started_at)
      values ('slack_list_sheet','running',$1,$2,$3,$4,$5,$6::jsonb,$7,$8,now()) returning id::text`, [
      options.persistEvents?"committed":"preview",
      result.diagnostics.rawRows, result.diagnostics.logicalItems, result.diagnostics.quarantinedRows,
      result.diagnostics.duplicateVariants, JSON.stringify(diagnostics), actor,options.approvalReason??null,
    ]);
    const syncRunId = run.rows[0].id;
    for (const row of result.rows) {
      await client.query(`insert into public.work_source_rows
        (sync_run_id,source,source_row_number,source_item_id,raw_payload,normalized_payload,logical_key,is_canonical_variant,
         is_quarantined,quarantine_reasons,ingested_at)
        values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10::text[],now())
        on conflict (sync_run_id,source_row_number) do nothing`, [syncRunId,row.source,row.sourceRowNumber,row.sourceItemId,
        JSON.stringify(row.payload ?? {}),JSON.stringify(row),row.logicalKey,result.canonicalRows.includes(row),
        result.quarantinedRows.includes(row),row.issues]);
    }
    let eventsInserted = 0;
    let eventsUpdated = 0;
    if (options.persistEvents) {
      for (const row of result.canonicalRows) {
        const outcome = await persistCanonicalEvent(client, row);
        if (outcome === "inserted") eventsInserted += 1;
        if (outcome === "updated") eventsUpdated += 1;
      }
    }
    await client.query(`update public.work_sync_runs set status='completed',canonical_event_count=$2,accepted_row_count=$2,
      reviewed_by=case when workflow_stage='committed' then $3 else null end,
      reviewed_at=case when workflow_stage='committed' then now() else null end,finished_at=now(),updated_at=now() where id=$1`,
      [syncRunId, eventsInserted + eventsUpdated,actor]);
    return { ...result.diagnostics, syncRunId, persistenceMode, eventsInserted, eventsUpdated };
  });
}
