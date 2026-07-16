import { query, transaction, type Queryable } from "../db";
import { canonicalContentUrlHash } from "../domain/work-events";
import { registrableDomain } from "../domain/project-settings";
import type {
  NormalizedWorkSourceRow,
  ReconciliationResult,
} from "../domain/work-source";

export type PersistedReconciliation = ReconciliationResult["diagnostics"] &
  SourcePreviewDiff & {
  syncRunId: string;
  persistenceMode: "raw_only" | "canonical_events";
  eventsInserted: number;
  eventsUpdated: number;
  legacyEventsMatched: number;
  sourceMissingEvents: number;
  idempotentReplay?: boolean;
};

export type SourcePreviewDiff = {
  newEvents: number;
  updatedEvents: number;
  unchangedEvents: number;
};

const eventIdentity = (
  row: Pick<
    NormalizedWorkSourceRow,
    "project" | "canonicalUrl" | "member" | "workDate" | "workType"
  >,
) =>
  [row.project, row.canonicalUrl, row.member, row.workDate, row.workType]
    .map((value) => value ?? "")
    .join("|");

export async function compareCanonicalEventCandidates(
  result: ReconciliationResult,
): Promise<SourcePreviewDiff> {
  const candidates = result.canonicalRows.filter(
    (row) => row.isCountable && !result.quarantinedRows.includes(row),
  );
  if (!candidates.length)
    return { newEvents: 0, updatedEvents: 0, unchangedEvents: 0 };
  const projects = [
    ...new Set(candidates.map((row) => row.project).filter(Boolean)),
  ];
  const existing = await query<any>(
    `select e.source,e.source_row_key,e.project,e.member_name,e.work_type,e.work_date::text,
    coalesce(e.canonical_url_snapshot,c.url) as canonical_url,coalesce(e.unified_source_state,'active') as unified_source_state
    from public.url_work_events e join public.content_urls c on c.id=e.content_url_id
    where e.project=any($1::text[])`,
    [projects],
  );
  const byIdentity = new Map(
    existing.rows.map((row) => [
      [
        row.project,
        row.canonical_url,
        row.member_name,
        String(row.work_date).slice(0, 10),
        row.work_type,
      ].join("|"),
      row,
    ]),
  );
  let newEvents = 0;
  let updatedEvents = 0;
  let unchangedEvents = 0;
  for (const candidate of candidates) {
    const row = byIdentity.get(eventIdentity(candidate));
    if (!row) newEvents += 1;
    else if (
      row.source !== candidate.source ||
      row.source_row_key !== candidate.logicalKey ||
      row.unified_source_state !== "active"
    )
      updatedEvents += 1;
    else unchangedEvents += 1;
  }
  return { newEvents, updatedEvents, unchangedEvents };
}

async function resolveUnitRule(
  client: Queryable,
  row: NormalizedWorkSourceRow,
) {
  const result = await client.query(
    `select id,unit_value,rule_version from public.kpi_work_unit_rules
    where is_active=true and work_type=$1 and difficulty=$2
      and (project is null or project=$3) and (member_name is null or member_name=$4)
    order by (member_name is not null)::int desc,(project is not null)::int desc,valid_from desc,id desc limit 1`,
    [
      row.workType,
      row.difficulty ||
        (row.workType === "audit" || row.workType === "update"
          ? "basic"
          : "normal"),
      row.project,
      row.member,
    ],
  );
  return result.rows[0] ?? null;
}

async function persistCanonicalEvent(
  client: Queryable,
  row: NormalizedWorkSourceRow,
) {
  if (
    !row.project ||
    !row.member ||
    !row.workType ||
    !row.workDate ||
    !row.canonicalUrl
  )
    return "skipped";
  const projectIdentity = await client.query(
    `insert into public.projects(canonical_name) values($1)
    on conflict(canonical_name) do update set updated_at=now()
    returning id::text,gsc_ready,kpi_ready,gsc_property,canonical_domain,include_subdomains,gsc_access_status`,
    [row.project],
  );
  const memberIdentity = await client.query(
    `insert into public.members(canonical_name) values($1)
    on conflict(canonical_name) do update set updated_at=now() returning id::text`,
    [row.member],
  );
  const hash = canonicalContentUrlHash(row.project, row.canonicalUrl);
  const normalizedDomain = new URL(row.canonicalUrl).hostname
    .toLowerCase()
    .replace(/^www\./, "");
  const canonicalDomain = String(projectIdentity.rows[0].canonical_domain ?? "")
    .toLowerCase()
    .replace(/^www\./, "");
  const domainAllowed = Boolean(
    canonicalDomain &&
      (normalizedDomain === canonicalDomain ||
        (projectIdentity.rows[0].include_subdomains &&
          normalizedDomain.endsWith(`.${canonicalDomain}`))),
  );
  const domainConflict = Boolean(canonicalDomain && !domainAllowed);
  const classificationStatus = !row.isCountable
    ? "quarantined"
    : domainConflict
      ? "pending"
      : "accepted";
  const classificationIssues = [
    ...row.issues.filter((issue) => issue !== "project_settings_missing"),
    ...(domainConflict ? ["project_domain_conflict"] : []),
  ];
  const contentEligible = row.isCountable && classificationStatus !== "quarantined";
  const gscEligible =
    contentEligible &&
    projectIdentity.rows[0].gsc_access_status === "verified" &&
    Boolean(projectIdentity.rows[0].gsc_ready);
  const performanceIssues = !contentEligible
    ? classificationIssues
    : gscEligible
      ? []
      : domainConflict
        ? ["project_domain_conflict"]
        : ["gsc_property_unverified"];
  const canonicalIdentity = await client.query(
    `select id::text from public.content_urls
     where project_id=$1 and url=$2
     order by (classification_status='accepted') desc,updated_at desc,id
     limit 1`,
    [projectIdentity.rows[0].id, row.canonicalUrl],
  );
  const contentUrl = canonicalIdentity.rows[0]
    ? await client.query(
        `update public.content_urls set project=$2,normalized_domain=$3,gsc_ready=$4,gsc_property=$5,
         member_name=$6,content_worked_at=$7,content_type=$8,is_active=true,source=$9,
         last_seen_at=now(),updated_at=now() where id=$1 returning id::text`,
        [
          canonicalIdentity.rows[0].id,
          row.project,
          normalizedDomain,
          Boolean(projectIdentity.rows[0].gsc_ready),
          projectIdentity.rows[0].gsc_property ?? null,
          row.member,
          row.workDate,
          row.workType,
          row.source,
        ],
      )
    : await client.query(
    `insert into public.content_urls
    (url_hash,project_id,project,url,normalized_domain,classification_status,classification_issues,classification_version,gsc_ready,gsc_property,
     member_name,member_email,content_worked_at,content_type,is_active,source,first_seen_at,last_seen_at,created_at,updated_at)
    values ($1,$2,$3,$4,$5,'accepted','[]'::jsonb,'source_pipeline_v1',$6,$7,$8,'',$9,$10,true,$11,now(),now(),now(),now())
    on conflict (url_hash) do update set project_id=excluded.project_id,normalized_domain=excluded.normalized_domain,
      classification_status='accepted',classification_issues='[]'::jsonb,classification_version='source_pipeline_v1',
      gsc_ready=excluded.gsc_ready,gsc_property=excluded.gsc_property,is_active=true,last_seen_at=now(),updated_at=now()
    returning id::text`,
    [
      hash,
      projectIdentity.rows[0].id,
      row.project,
      row.canonicalUrl,
      normalizedDomain,
      Boolean(projectIdentity.rows[0].gsc_ready),
      projectIdentity.rows[0].gsc_property ?? null,
      row.member,
      row.workDate,
      row.workType,
      row.source,
    ],
      );
  await client.query(
    `update public.content_urls set registrable_domain=$2,classification_status=$3,
     classification_issues=$4::jsonb,classified_at=now(),gsc_ready=$5,
     gsc_eligibility_reason=$6,updated_at=now() where id=$1`,
    [
      contentUrl.rows[0].id,
      registrableDomain(normalizedDomain),
      classificationStatus,
      JSON.stringify(classificationIssues),
      gscEligible,
      gscEligible
        ? "verified_property_scope"
        : contentEligible && !domainConflict
          ? "gsc_property_unverified"
          : domainConflict
            ? "project_domain_conflict"
            : "source_invalid",
    ],
  );
  const rule = await resolveUnitRule(client, row);
  const sourceRowKey = row.sourceItemId ? null : row.logicalKey;
  const existing = await client.query(
    `select id::text,source from public.url_work_events where
    (project_id=$1 and content_url_id=$2 and member_id=$3 and work_date=$4 and work_type=$5)
    or (source=$6 and (($7::text is not null and source_item_id=$7) or ($7::text is null and source_row_key=$8)))
    order by (project_id=$1 and content_url_id=$2 and member_id=$3 and work_date=$4 and work_type=$5) desc,id limit 1`,
    [
      projectIdentity.rows[0].id,
      contentUrl.rows[0].id,
      memberIdentity.rows[0].id,
      row.workDate,
      row.workType,
      row.source,
      row.sourceItemId,
      sourceRowKey,
    ],
  );
  const lineage = JSON.stringify([
    {
      source: row.source,
      sourceRowNumber: row.sourceRowNumber,
      logicalKey: row.logicalKey,
    },
  ]);
  if (existing.rowCount) {
    await client.query(
      `update public.url_work_events set content_url_id=$2,project_id=$3,member_id=$4,project=$5,member_name=$6,
      work_type=$7,work_date=$8,difficulty=$9,unit_value=$10,source_status=$11,source_url=$12,canonical_url_snapshot=$13,
      completed_at=$8,date_confidence=$14,difficulty_source=$15,unit_rule_id=$16,unit_rule_version=$17,is_countable=$18,
      kpi_ready=$19,readiness_issues=$20::jsonb,exclusion_reason=$21,status=$22,note=$23,updated_at=now() where id=$1`,
      [
        existing.rows[0].id,
        contentUrl.rows[0].id,
        projectIdentity.rows[0].id,
        memberIdentity.rows[0].id,
        row.project,
        row.member,
        row.workType,
        row.workDate,
        row.difficulty ||
          (row.workType === "audit" || row.workType === "update"
            ? "basic"
            : "normal"),
        Number(rule?.unit_value ?? 0),
        row.sourceStatusRaw,
        row.urlRaw,
        row.canonicalUrl,
        row.dateConfidence,
        row.difficulty ? "source" : "default",
        rule?.id ?? null,
        rule?.rule_version ?? "kpi_v2",
        row.isCountable,
        Boolean(projectIdentity.rows[0].kpi_ready) && row.isCountable,
        JSON.stringify(
          Boolean(projectIdentity.rows[0].kpi_ready)
            ? row.issues
            : [...row.issues, "project_not_kpi_ready"],
        ),
        row.isCountable ? null : row.issues.join(",") || "not_eligible",
        row.status,
        row.issues.join(",") || null,
      ],
    );
    await client.query(
      `update public.url_work_events set
      source_row_key=case when source=$2 then $3 else source_row_key end,
      source_lineage=case when coalesce(source_lineage,'[]'::jsonb) @> $4::jsonb then coalesce(source_lineage,'[]'::jsonb)
        else coalesce(source_lineage,'[]'::jsonb)||$4::jsonb end,
      unified_source_state='active',source_missing_at=null,updated_at=now() where id=$1`,
      [existing.rows[0].id, row.source, sourceRowKey, lineage],
    );
    await client.query(
      `update public.url_work_events set kpi_ready=$2,content_kpi_eligible=$2,
       performance_kpi_eligible=$3,performance_readiness_state=$4,
       performance_readiness_issues=$5::jsonb,
       readiness_issues=(coalesce(readiness_issues,'[]'::jsonb)-'project_not_kpi_ready'),updated_at=now()
       where id=$1`,
      [
        existing.rows[0].id,
        contentEligible,
        gscEligible,
        gscEligible ? "fallback" : contentEligible ? "pm_review" : "blocked_system_error",
        JSON.stringify(performanceIssues),
      ],
    );
    return existing.rows[0].source === row.source
      ? "updated"
      : "legacy_matched";
  }
  const inserted = await client.query(
    `insert into public.url_work_events
    (content_url_id,project_id,member_id,project,member_name,member_email,work_type,work_date,difficulty,unit_value,source,source_row_key,
      source_item_id,source_status,source_url,canonical_url_snapshot,completed_at,date_confidence,difficulty_source,
      unit_rule_id,unit_rule_version,is_countable,kpi_ready,readiness_issues,exclusion_reason,status,note,source_lineage,
      unified_source_state,created_at,updated_at)
    values ($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$7,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26::jsonb,'active',now(),now())
    on conflict (source,source_item_id) where source_item_id is not null do update set
      content_url_id=excluded.content_url_id,project_id=excluded.project_id,member_id=excluded.member_id,project=excluded.project,member_name=excluded.member_name,work_type=excluded.work_type,
      work_date=excluded.work_date,difficulty=excluded.difficulty,unit_value=excluded.unit_value,source_status=excluded.source_status,
      source_url=excluded.source_url,canonical_url_snapshot=excluded.canonical_url_snapshot,date_confidence=excluded.date_confidence,
      unit_rule_id=excluded.unit_rule_id,unit_rule_version=excluded.unit_rule_version,is_countable=excluded.is_countable,
      kpi_ready=excluded.kpi_ready,readiness_issues=excluded.readiness_issues,exclusion_reason=excluded.exclusion_reason,
      status=excluded.status,note=excluded.note,updated_at=now()
    returning id::text`,
    [
      contentUrl.rows[0].id,
      projectIdentity.rows[0].id,
      memberIdentity.rows[0].id,
      row.project,
      row.member,
      row.workType,
      row.workDate,
      row.difficulty ||
        (row.workType === "audit" || row.workType === "update"
          ? "basic"
          : "normal"),
      Number(rule?.unit_value ?? 0),
      row.source,
      sourceRowKey,
      row.sourceItemId,
      row.sourceStatusRaw,
      row.urlRaw,
      row.canonicalUrl,
      row.dateConfidence,
      row.difficulty ? "source" : "default",
      rule?.id ?? null,
      rule?.rule_version ?? "kpi_v2",
      row.isCountable,
      Boolean(projectIdentity.rows[0].kpi_ready) && row.isCountable,
      JSON.stringify(
        Boolean(projectIdentity.rows[0].kpi_ready)
          ? row.issues
          : [...row.issues, "project_not_kpi_ready"],
      ),
      row.isCountable ? null : row.issues.join(",") || "not_eligible",
      row.status,
      row.issues.join(",") || null,
      lineage,
    ],
  );
  await client.query(
    `update public.url_work_events set kpi_ready=$2,content_kpi_eligible=$2,
     performance_kpi_eligible=$3,performance_readiness_state=$4,
     performance_readiness_issues=$5::jsonb,
     readiness_issues=(coalesce(readiness_issues,'[]'::jsonb)-'project_not_kpi_ready'),updated_at=now()
     where id=$1`,
    [
      inserted.rows[0].id,
      contentEligible,
      gscEligible,
      gscEligible ? "fallback" : contentEligible ? "pm_review" : "blocked_system_error",
      JSON.stringify(performanceIssues),
    ],
  );
  return "inserted";
}

export async function persistWorkSourceReconciliation(
  result: ReconciliationResult,
  actor: string,
  options: {
    persistEvents?: boolean;
    approvalReason?: string | null;
    previewRunId?: string | null;
    idempotencyKey?: string | null;
    previewDiff?: SourcePreviewDiff;
  } = {},
): Promise<PersistedReconciliation> {
  return transaction(async (client) => {
    const persistenceMode = options.persistEvents
      ? "canonical_events"
      : "raw_only";
    if (options.persistEvents && options.idempotencyKey) {
      const replay = await client.query(
        `select id::text,diagnostics from public.work_sync_runs
        where idempotency_key=$1 and workflow_stage='committed' limit 1`,
        [options.idempotencyKey],
      );
      if (replay.rows[0])
        return {
          ...replay.rows[0].diagnostics,
          syncRunId: replay.rows[0].id,
          idempotentReplay: true,
        };
    }
    const source = result.rows[0]?.source ?? "content_urls_sheet";
    const diff = options.previewDiff ?? {
      newEvents: 0,
      updatedEvents: 0,
      unchangedEvents: 0,
    };
    const diagnostics = {
      ...result.diagnostics,
      ...diff,
      persistenceMode,
      approvalReason: options.approvalReason ?? null,
    };
    const run = await client.query(
      `insert into public.work_sync_runs
      (source,status,workflow_stage,raw_row_count,logical_item_count,quarantined_count,duplicate_variant_count,diagnostics,
       triggered_by,approval_reason,accepted_row_count,canonical_event_count,valid_work_record_count,canonical_url_count,
       new_event_count,updated_event_count,needs_attention_count,committed_from_run_id,idempotency_key,started_at)
      values ($1,'running',$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10,$10,$11,$12,$13,$14,$15,$16,now()) returning id::text`,
      [
        source,
        options.persistEvents ? "committed" : "preview",
        result.diagnostics.rawRows,
        result.diagnostics.logicalItems,
        result.diagnostics.quarantinedRows,
        result.diagnostics.duplicateVariants,
        JSON.stringify(diagnostics),
        actor,
        options.approvalReason ?? null,
        result.diagnostics.acceptedCandidates,
        result.diagnostics.canonicalUrls,
        diff.newEvents,
        diff.updatedEvents,
        result.diagnostics.needsAttention,
        options.previewRunId ?? null,
        options.idempotencyKey ?? null,
      ],
    );
    const syncRunId = run.rows[0].id;
    for (const row of result.rows) {
      await client.query(
        `insert into public.work_source_rows
        (sync_run_id,source,source_row_number,source_item_id,raw_payload,normalized_payload,logical_key,is_canonical_variant,
         is_quarantined,quarantine_reasons,ingested_at)
        values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10::text[],now())
        on conflict (sync_run_id,source_row_number) do nothing`,
        [
          syncRunId,
          row.source,
          row.sourceRowNumber,
          row.sourceItemId,
          JSON.stringify(row.payload ?? {}),
          JSON.stringify(row),
          row.logicalKey,
          result.canonicalRows.includes(row),
          result.quarantinedRows.includes(row),
          row.issues,
        ],
      );
    }
    let eventsInserted = 0;
    let eventsUpdated = 0;
    let legacyEventsMatched = 0;
    let sourceMissingEvents = 0;
    if (options.persistEvents) {
      for (const row of result.canonicalRows.filter(
        (candidate) =>
          candidate.isCountable && !result.quarantinedRows.includes(candidate),
      )) {
        const outcome = await persistCanonicalEvent(client, row);
        if (outcome === "inserted") eventsInserted += 1;
        if (outcome === "updated") eventsUpdated += 1;
        if (outcome === "legacy_matched") {
          eventsUpdated += 1;
          legacyEventsMatched += 1;
        }
      }
      const active = result.canonicalRows
        .filter(
          (candidate) =>
            candidate.isCountable &&
            !result.quarantinedRows.includes(candidate),
        )
        .map((row) => ({
          project: row.project,
          canonicalUrl: row.canonicalUrl,
          member: row.member,
          workDate: row.workDate,
          workType: row.workType,
        }));
      const missing = await client.query(
        `update public.url_work_events e set
        unified_source_state=case when e.source='content_urls_sheet' then 'source_missing' else 'inactive_for_unified_kpi' end,
        source_missing_at=now(),kpi_ready=false,content_kpi_eligible=false,performance_kpi_eligible=false,
        performance_readiness_state='blocked_system_error',
        performance_readiness_issues=case when coalesce(e.performance_readiness_issues,'[]'::jsonb) ? 'source_missing'
          then coalesce(e.performance_readiness_issues,'[]'::jsonb)
          else coalesce(e.performance_readiness_issues,'[]'::jsonb)||'["source_missing"]'::jsonb end,
        readiness_issues=case when coalesce(e.readiness_issues,'[]'::jsonb) ? 'source_missing' then coalesce(e.readiness_issues,'[]'::jsonb)
          else coalesce(e.readiness_issues,'[]'::jsonb)||'["source_missing"]'::jsonb end,updated_at=now()
        from public.content_urls c where c.id=e.content_url_id and e.source in ('content_urls_sheet','slack_list_sheet','google_sheet','legacy_sheet')
        and coalesce(e.unified_source_state,'active')='active' and not exists(
          select 1 from jsonb_to_recordset($1::jsonb) as active_row(project text,"canonicalUrl" text,member text,"workDate" date,"workType" text)
          where active_row.project=e.project and active_row."canonicalUrl"=coalesce(e.canonical_url_snapshot,c.url)
            and active_row.member=e.member_name and active_row."workDate"=e.work_date and active_row."workType"=e.work_type
        )`,
        [JSON.stringify(active)],
      );
      sourceMissingEvents = missing.rowCount ?? 0;
    }
    const finalDiagnostics = {
      ...diagnostics,
      eventsInserted,
      eventsUpdated,
      legacyEventsMatched,
      sourceMissingEvents,
    };
    await client.query(
      `update public.work_sync_runs set status=$2,diagnostics=$3::jsonb,
      reviewed_by=case when workflow_stage='committed' then $4 else null end,
      reviewed_at=case when workflow_stage='committed' then now() else null end,finished_at=now(),updated_at=now() where id=$1`,
      [
        syncRunId,
        options.persistEvents
          ? result.diagnostics.needsAttention > 0
            ? "partial"
            : "committed"
          : "preview_ready",
        JSON.stringify(finalDiagnostics),
        actor,
      ],
    );
    return {
      ...result.diagnostics,
      ...diff,
      syncRunId,
      persistenceMode,
      eventsInserted,
      eventsUpdated,
      legacyEventsMatched,
      sourceMissingEvents,
    };
  });
}

export async function recordFailedSourcePipelineRun(input: {
  source?: string;
  actor: string;
  requestId: string;
  error: unknown;
}) {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  const result = await query<any>(
    `insert into public.work_sync_runs
      (source,status,workflow_stage,raw_row_count,logical_item_count,canonical_event_count,
       quarantined_count,duplicate_variant_count,diagnostics,triggered_by,error_message,
       valid_work_record_count,canonical_url_count,new_event_count,updated_event_count,
       needs_attention_count,started_at,finished_at,created_at,updated_at)
     values($1,'failed','committed',0,0,0,0,0,$2::jsonb,$3,$4,0,0,0,0,0,now(),now(),now(),now())
     returning id::text`,
    [
      input.source ?? "content_urls_sheet",
      JSON.stringify({ requestId: input.requestId, failurePersisted: true }),
      input.actor,
      message.slice(0, 2000),
    ],
  );
  return result.rows[0];
}

export async function countActiveCanonicalUrls() {
  const result = await query<any>(
    `select count(*)::int as count from public.content_urls
     where coalesce(is_active,true)=true and coalesce(unified_source_state,'active')='active'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function loadPreviewReconciliation(
  previewRunId: string,
): Promise<{ result: ReconciliationResult; diff: SourcePreviewDiff }> {
  const run = await query<any>(
    `select id::text,source,status,workflow_stage,diagnostics from public.work_sync_runs
    where id=$1 and source='content_urls_sheet' and workflow_stage='preview' and status='preview_ready' limit 1`,
    [previewRunId],
  );
  if (!run.rows[0])
    throw new Error("Preview run was not found or is not ready to commit.");
  const sourceRows = await query<any>(
    `select normalized_payload,is_canonical_variant,is_quarantined from public.work_source_rows
    where sync_run_id=$1 order by source_row_number`,
    [previewRunId],
  );
  const rows = sourceRows.rows.map(
    (row) => row.normalized_payload as NormalizedWorkSourceRow,
  );
  const canonicalRows = sourceRows.rows
    .filter((row) => row.is_canonical_variant)
    .map((row) => row.normalized_payload as NormalizedWorkSourceRow);
  const quarantinedRows = sourceRows.rows
    .filter((row) => row.is_quarantined)
    .map((row) => row.normalized_payload as NormalizedWorkSourceRow);
  const duplicateRows = sourceRows.rows
    .filter((row) => !row.is_canonical_variant)
    .map((row) => row.normalized_payload as NormalizedWorkSourceRow);
  const diagnostics = run.rows[0]
    .diagnostics as ReconciliationResult["diagnostics"] & SourcePreviewDiff;
  return {
    result: {
      rows,
      canonicalRows,
      quarantinedRows,
      duplicateRows,
      diagnostics,
    },
    diff: {
      newEvents: Number(diagnostics.newEvents ?? 0),
      updatedEvents: Number(diagnostics.updatedEvents ?? 0),
      unchangedEvents: Number(diagnostics.unchangedEvents ?? 0),
    },
  };
}
