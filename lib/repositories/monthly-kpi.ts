import { query, transaction } from "../db";
import { validateMonthlyMemberTarget } from "../domain/member-target";
import {
  validateMemberKpiConfig,
  type MemberKpiWeights,
} from "../domain/member-kpi-config";
import { calculateQuantity } from "../kpi/quantity";
import { scoreBase, type AuditableScore } from "../kpi/types";
import { calculateSeoContent } from "../kpi/seo-content";
import {
  calculateFinalMonthlyKpi,
  type MonthlyComponent,
} from "../kpi/monthly-final";
import { getPerformanceWorkspace } from "../services/performance-service";

const monthKey = (value: string) =>
  /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);

export async function upsertMonthlyTarget(input: {
  month: string;
  memberName: string;
  memberEmail?: string | null;
  targetUnits: number;
  baseTargetUnits?: number | null;
  activeWorkdayRatio?: number | null;
  adjustmentReason?: string | null;
  notes?: string | null;
  actor: string;
}) {
  const valid = validateMonthlyMemberTarget(input);
  const member = await query<any>(
    `select id::text,email from public.members where canonical_name=$1 and is_active=true limit 1`,
    [valid.memberName],
  );
  if (!member.rows[0]) throw new Error("Member identity was not found.");
  const saved = await query(
    `insert into public.monthly_member_targets
    (month_key,member_id,member_name,member_email,target_units,base_target_units,active_workday_ratio,adjustment_reason,notes,version,status,created_by,approved_by,approved_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,1,'approved',$10,$10,now(),now(),now())
    on conflict(month_key,member_name) do update set member_id=excluded.member_id,member_email=excluded.member_email,
      target_units=excluded.target_units,base_target_units=excluded.base_target_units,active_workday_ratio=excluded.active_workday_ratio,
      adjustment_reason=excluded.adjustment_reason,notes=excluded.notes,version=public.monthly_member_targets.version+1,
      approved_by=excluded.approved_by,approved_at=now(),updated_at=now()
    where public.monthly_member_targets.status<>'locked' returning *`,
    [
      monthKey(valid.month),
      member.rows[0].id,
      valid.memberName,
      input.memberEmail ?? member.rows[0].email ?? null,
      valid.targetUnits,
      valid.baseTargetUnits,
      valid.activeWorkdayRatio,
      valid.adjustmentReason,
      input.notes ?? null,
      input.actor,
    ],
  );
  if (!saved.rows[0])
    throw new Error(
      "The Member x Month target is locked. Reopen the KPI version before changing it.",
    );
  return saved;
}

async function upsertAutomatedComponent(
  month: string,
  memberName: string,
  key: "seo_content" | "seo_performance",
  score: AuditableScore,
) {
  await query(
    `insert into public.monthly_member_kpi_component_scores
    (month_key,member_name,component_key,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,reason,source_ids,audit_trail,diagnostics,data_as_of,calculated_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,now(),now(),now())
    on conflict(month_key,member_name,component_key,rule_version) do update set raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,
      coverage_pct=excluded.coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,override_reason=excluded.override_reason,
      status=excluded.status,reason=excluded.reason,source_ids=excluded.source_ids,audit_trail=excluded.audit_trail,
      diagnostics=excluded.diagnostics,data_as_of=excluded.data_as_of,calculated_at=now(),updated_at=now()`,
    [
      month,
      memberName,
      key,
      score.rawPct,
      score.payablePct,
      score.coveragePct,
      score.confidence,
      score.sourceCohort,
      score.ruleVersion,
      score.overrideReason,
      score.state,
      score.reason,
      JSON.stringify(score.sourceIds),
      JSON.stringify(score.auditTrail),
      JSON.stringify(score.diagnostics),
      score.dataAsOf,
    ],
  );
}

async function calculateMemberMonth(month: string, target: any) {
  const eventsResult = await query<any>(
    `select id::text,unit_value,status,is_countable,work_date::text,unit_rule_id::text,unit_rule_version
    from public.url_work_events where member_name=$1 and content_kpi_eligible=true and is_countable=true
      and coalesce(unified_source_state,'active')='active' and work_date>=date_trunc('month',$2::date)
      and work_date<date_trunc('month',$2::date)+interval '1 month' order by work_date,id`,
    [target.member_name, month],
  );
  const quantity = calculateQuantity({
    month: month.slice(0, 7),
    targetUnits: Number(target.target_units),
    events: eventsResult.rows.map((event) => ({
      id: event.id,
      unitValue: Number(event.unit_value),
      status: event.status,
      isCountable: event.is_countable,
      workDate: event.work_date,
      unitRuleId: event.unit_rule_id,
      unitRuleVersion: event.unit_rule_version,
    })),
  });
  const qualityRows = await query<any>(
    `select e.id::text,e.unit_value,r.quality_pct,r.review_status from public.url_work_events e
    left join public.url_work_quality_reviews r on r.work_event_id=e.id where e.member_name=$1 and e.is_countable=true and e.content_kpi_eligible=true
      and coalesce(e.unified_source_state,'active')='active' and e.status in ('completed','approved')
      and e.work_date>=date_trunc('month',$2::date) and e.work_date<date_trunc('month',$2::date)+interval '1 month'`,
    [target.member_name, month],
  );
  const eligibleUnits = qualityRows.rows.reduce(
    (sum, row) => sum + Number(row.unit_value),
    0,
  );
  const reviewed = qualityRows.rows.filter(
    (row) => row.review_status === "approved" && row.quality_pct !== null,
  );
  const reviewedUnits = reviewed.reduce(
    (sum, row) => sum + Number(row.unit_value),
    0,
  );
  const qualityPct = reviewedUnits
    ? reviewed.reduce(
        (sum, row) => sum + Number(row.quality_pct) * Number(row.unit_value),
        0,
      ) / reviewedUnits
    : null;
  const quality = {
    ...scoreBase({
      ruleVersion: "quality_member_month_v1",
      state:
        eligibleUnits === 0
          ? "not_applicable"
          : reviewedUnits === eligibleUnits
            ? "scored"
            : "incomplete",
      rawPct: qualityPct,
      payablePct: qualityPct,
      coveragePct: eligibleUnits ? (reviewedUnits / eligibleUnits) * 100 : null,
      confidence: reviewedUnits === eligibleUnits ? "high" : "low",
      sourceCohort: `quality_reviews:${month.slice(0, 7)}:${target.member_name}`,
      sourceIds: reviewed.map((row) => row.id),
      reason:
        reviewedUnits === eligibleUnits ? null : "review_coverage_incomplete",
    }),
    reviewedUnits,
    eligibleUnits,
    eventResults: [],
  };
  const seoContent = calculateSeoContent(quantity, quality);
  const workspace = await getPerformanceWorkspace({
    asOfMonth: month,
    memberName: target.member_name,
  });
  const summary = workspace.summaries[0];
  const memberPerformance = summary?.memberResult;
  const performanceSourceIds =
    summary?.projects.flatMap((project: any) =>
      project.ranges.flatMap((range: any) =>
        Array.isArray(range.source_ids) ? range.source_ids : [],
      ),
    ) ?? [];
  const performance =
    memberPerformance?.score !== null && memberPerformance?.score !== undefined
      ? scoreBase({
          ruleVersion: "performance_member_work_units_v2",
          state:
            memberPerformance.status === "scored" ? "scored" : "incomplete",
          rawPct: Number(memberPerformance.score),
          payablePct: Number(memberPerformance.score),
          coveragePct: memberPerformance.coveragePct,
          confidence: memberPerformance.coveragePct === 100 ? "high" : "low",
          reason: memberPerformance.reason,
          sourceIds: [...new Set(performanceSourceIds)],
          diagnostics: {
            projects: memberPerformance.projects,
            weighting: "eligible_work_units",
          },
        })
      : scoreBase({
          ruleVersion: "performance_member_work_units_v2",
          state: "insufficient_data",
          reason: memberPerformance?.reason ?? "performance_not_refreshed",
          diagnostics: { status: memberPerformance?.status ?? "missing" },
        });
  await upsertAutomatedComponent(
    month,
    target.member_name,
    "seo_content",
    seoContent,
  );
  await upsertAutomatedComponent(
    month,
    target.member_name,
    "seo_performance",
    performance,
  );
  return { target, quantity, quality, seoContent, performance };
}

export async function calculateMonthlyKpi(monthInput: string) {
  const month = monthKey(monthInput);
  const targets = await query<any>(
    `select * from public.monthly_member_targets where month_key=$1 and status in ('approved','locked') order by member_name`,
    [month],
  );
  const members = [];
  for (const target of targets.rows)
    members.push(await calculateMemberMonth(month, target));
  return { month, members: members.length, memberResults: members };
}

export async function saveManualComponent(input: {
  month: string;
  memberName: string;
  componentKey: "social_video";
  scorePct: number | null;
  isNotApplicable?: boolean;
  reason?: string | null;
  evidence?: Record<string, unknown>;
  actor: string;
}) {
  const isNa = Boolean(input.isNotApplicable);
  if (isNa && input.scorePct !== null)
    throw new Error("Social + Video cannot have both a score and N/A status.");
  if (isNa && !input.reason?.trim())
    throw new Error("An N/A reason is required.");
  if (
    !isNa &&
    (input.scorePct === null || input.scorePct < 0 || input.scorePct > 100)
  )
    throw new Error(
      "Social + Video score must be between 0 and 100, or explicitly N/A with a reason.",
    );
  const score = scoreBase({
    ruleVersion: "social_video_manual_v2",
    state: isNa ? "not_applicable" : "approved",
    rawPct: input.scorePct,
    payablePct: isNa ? null : input.scorePct,
    coveragePct: isNa ? null : 100,
    confidence: "medium",
    reason: isNa ? (input.reason ?? null) : null,
    overrideReason: input.reason ?? null,
    auditTrail: [
      {
        action: isNa ? "social_video_na" : "social_video_approved",
        actor: input.actor,
        at: new Date().toISOString(),
        reason: input.reason ?? null,
      },
    ],
  });
  const month = monthKey(input.month);
  await query(
    `insert into public.monthly_member_kpi_component_scores
    (month_key,member_name,component_key,raw_pct,payable_pct,coverage_pct,confidence,rule_version,override_reason,status,reason,
     source_ids,audit_trail,diagnostics,is_not_applicable,na_reason,evidence,calculated_at,approved_by,approved_at,created_at,updated_at)
    values($1,$2,'social_video',$3,$4,$5,$6,'social_video_manual_v2',$7,$8,$9,'[]'::jsonb,$10::jsonb,'{}'::jsonb,$11,$12,$13::jsonb,now(),$14,now(),now(),now())
    on conflict(month_key,member_name,component_key,rule_version) do update set raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,
      coverage_pct=excluded.coverage_pct,confidence=excluded.confidence,override_reason=excluded.override_reason,status=excluded.status,
      reason=excluded.reason,audit_trail=excluded.audit_trail,is_not_applicable=excluded.is_not_applicable,na_reason=excluded.na_reason,
      evidence=excluded.evidence,approved_by=excluded.approved_by,approved_at=now(),updated_at=now()`,
    [
      month,
      input.memberName,
      input.scorePct,
      isNa ? null : input.scorePct,
      isNa ? null : 100,
      score.confidence,
      input.reason ?? null,
      score.state,
      score.reason,
      JSON.stringify(score.auditTrail),
      isNa,
      input.reason ?? null,
      JSON.stringify(input.evidence ?? {}),
      input.actor,
    ],
  );
  return score;
}

export async function saveMemberKpiConfig(input: {
  month: string;
  memberName: string;
  socialVideoEnabled: boolean;
  weights: MemberKpiWeights;
  reason: string;
  actor: string;
  approve?: boolean;
}) {
  if (!input.memberName?.trim() || !input.reason?.trim())
    throw new Error("Member and configuration reason are required.");
  const validated = validateMemberKpiConfig({
    socialVideoEnabled: Boolean(input.socialVideoEnabled),
    weights: input.weights,
  });
  const month = monthKey(input.month);
  return transaction(async (client) => {
    const member = await client.query(
      `select id::text from public.members where canonical_name=$1 and is_active=true limit 1`,
      [input.memberName.trim()],
    );
    if (!member.rows[0]) throw new Error("Member identity was not found.");
    const latestResult = await client.query(
      `select * from public.monthly_member_kpi_configs where month_key=$1 and member_name=$2 order by version desc limit 1`,
      [month, input.memberName.trim()],
    );
    const latest = latestResult.rows[0] ?? null;
    if (latest?.status === "locked")
      throw new Error(
        "This Member x Month configuration is locked. Reopen the locked KPI result before changing weights.",
      );
    const status = input.approve === false ? "draft" : "approved";
    if (status === "approved" && latest?.status === "approved")
      await client.query(
        `update public.monthly_member_kpi_configs set status='superseded',updated_at=now()
      where id=$1`,
        [latest.id],
      );
    const version =
      latest?.status === "draft"
        ? Number(latest.version)
        : Number(latest?.version ?? 0) + 1;
    const config =
      latest?.status === "draft"
        ? await client.query(
            `update public.monthly_member_kpi_configs set member_id=$2,status=$3,social_video_enabled=$4,reason=$5,
        approved_by=$6,approved_at=$7,updated_at=now() where id=$1 returning *`,
            [
              latest.id,
              member.rows[0].id,
              status,
              validated.socialVideoEnabled,
              input.reason.trim(),
              status === "approved" ? input.actor : null,
              status === "approved" ? new Date().toISOString() : null,
            ],
          )
        : await client.query(
            `insert into public.monthly_member_kpi_configs
      (month_key,member_id,member_name,version,status,social_video_enabled,reason,created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) returning *`,
            [
              month,
              member.rows[0].id,
              input.memberName.trim(),
              version,
              status,
              validated.socialVideoEnabled,
              input.reason.trim(),
              input.actor,
              status === "approved" ? input.actor : null,
              status === "approved" ? new Date().toISOString() : null,
            ],
          );
    if (latest?.status === "draft")
      await client.query(
        `delete from public.monthly_member_kpi_config_components where config_id=$1`,
        [config.rows[0].id],
      );
    for (const component of validated.components)
      await client.query(
        `insert into public.monthly_member_kpi_config_components(config_id,component_key,weight_pct,is_required,allows_na,display_order)
      values($1,$2,$3,$4,$5,$6)`,
        [
          config.rows[0].id,
          component.componentKey,
          component.weightPct,
          component.isRequired,
          component.allowsNa,
          component.displayOrder,
        ],
      );
    await client.query(
      `insert into public.application_audit_log(actor,action,entity_type,entity_id,after_value,reason)
      values($1,$2,'monthly_member_kpi_config',$3,$4::jsonb,$5)`,
      [
        input.actor,
        status === "approved" ? "approve" : "save_draft",
        String(config.rows[0].id),
        JSON.stringify({
          memberName: input.memberName,
          month,
          version,
          ...validated,
        }),
        input.reason.trim(),
      ],
    );
    return { ...config.rows[0], components: validated.components };
  });
}

export async function calculateMemberFinal(input: {
  month: string;
  memberName: string;
  acknowledgeMissingPerformance?: boolean;
  missingPerformanceReason?: string | null;
}) {
  const month = monthKey(input.month);
  const config = await query<any>(
    `select c.*,coalesce(json_agg(json_build_object('component_key',cc.component_key,'weight_pct',cc.weight_pct,'is_required',cc.is_required,'allows_na',cc.allows_na,'display_order',cc.display_order) order by cc.display_order) filter(where cc.id is not null),'[]'::json) as components
    from public.monthly_member_kpi_configs c left join public.monthly_member_kpi_config_components cc on cc.config_id=c.id
    where c.month_key=$1 and c.member_name=$2 and c.status='approved' group by c.id order by c.version desc limit 1`,
    [month, input.memberName],
  );
  if (!config.rows[0])
    throw new Error("No approved Member × Month KPI configuration exists.");
  const scores = await query<any>(
    `select distinct on(component_key) * from public.monthly_member_kpi_component_scores
    where month_key=$1 and member_name=$2 order by component_key,calculated_at desc`,
    [month, input.memberName],
  );
  const definitions = config.rows[0].components as any[];
  const components: MonthlyComponent[] = definitions.map((definition) => {
    const row = scores.rows.find(
      (score) => score.component_key === definition.component_key,
    );
    const disabledSocial =
      definition.component_key === "social_video" &&
      !config.rows[0].social_video_enabled;
    const score = disabledSocial
      ? scoreBase({
          ruleVersion: "social_video_disabled_v1",
          state: "not_applicable",
          reason: "social_video_disabled_for_member",
        })
      : row
        ? scoreBase({
            ruleVersion: row.rule_version,
            state: row.status,
            rawPct: row.raw_pct === null ? null : Number(row.raw_pct),
            payablePct:
              row.payable_pct === null ? null : Number(row.payable_pct),
            coveragePct:
              row.coverage_pct === null ? null : Number(row.coverage_pct),
            confidence: row.confidence,
            sourceCohort: row.source_cohort,
            overrideReason: row.override_reason,
            reason: row.reason,
            sourceIds: row.source_ids ?? [],
            auditTrail: row.audit_trail ?? [],
            diagnostics: row.diagnostics ?? {},
          })
        : scoreBase({
            ruleVersion: "component_missing",
            state: "incomplete",
            reason: "component_missing",
          });
    return {
      key: definition.component_key,
      weightPct: Number(definition.weight_pct),
      required: Boolean(definition.is_required),
      allowsNa: Boolean(definition.allows_na),
      score,
    };
  });
  const result = calculateFinalMonthlyKpi({
    components,
    acknowledgeMissingPerformance: input.acknowledgeMissingPerformance,
    missingPerformanceReason: input.missingPerformanceReason,
    ruleVersion: `member_kpi_config_v${config.rows[0].version}`,
  });
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      configId: String(config.rows[0].id),
      configVersion: Number(config.rows[0].version),
      socialVideoEnabled: Boolean(config.rows[0].social_video_enabled),
    },
  };
}

export async function listMonthlyKpiAudit(
  monthInput: string,
  memberName?: string,
) {
  const month = monthKey(monthInput);
  const memberParams: any[] = [month];
  const memberClause = memberName
    ? (memberParams.push(memberName), ` and member_name=$2`)
    : "";
  const eventParams: any[] = [month];
  const eventClause = memberName
    ? (eventParams.push(memberName), ` and e.member_name=$2`)
    : "";
  const [
    targets,
    projects,
    components,
    results,
    configs,
    overrides,
    reviews,
    reconciliation,
    reviewDiagnostics,
  ] = await Promise.all([
    query(
      `select * from public.monthly_member_targets where month_key=$1${memberClause} order by member_name`,
      memberParams,
    ),
    query(
      `select * from public.monthly_member_project_kpi_results where month_key=$1${memberClause} order by member_name,project`,
      memberParams,
    ),
    query(
      `select * from public.monthly_member_kpi_component_scores where month_key=$1${memberClause} order by member_name,component_key`,
      memberParams,
    ),
    query(
      `select * from public.monthly_member_kpi_results where month_key=$1${memberClause} order by member_name,version desc`,
      memberParams,
    ),
    query(
      `select c.*,coalesce(json_agg(json_build_object('componentKey',cc.component_key,'weightPct',cc.weight_pct) order by cc.display_order) filter(where cc.id is not null),'[]'::json) as config_components
      from public.monthly_member_kpi_configs c left join public.monthly_member_kpi_config_components cc on cc.config_id=c.id where c.month_key=$1${memberClause} group by c.id order by c.member_name,c.version desc`,
      memberParams,
    ),
    query(
      `select * from public.kpi_override_audit_log where month_key=$1${memberClause} order by created_at`,
      memberParams,
    ),
    query(
      `select e.id::text as work_event_id,e.project,e.member_name,e.work_type,e.work_date::text,e.unit_value,c.url,
      r.review_status,r.quality_pct,r.rubric_version_snapshot,r.admin_note,r.evidence,
      coalesce(scores.criteria,'[]'::jsonb) as saved_criteria from public.url_work_events e
      join public.content_urls c on c.id=e.content_url_id left join lateral(select * from public.url_work_quality_reviews q where q.work_event_id=e.id order by q.updated_at desc,q.id desc limit 1)r on true
      left join lateral(
        select jsonb_agg(jsonb_build_object(
          'criterionKey',s.criterion_key_snapshot,'score',s.score,'isNa',s.is_na,
          'naReason',s.na_reason,'note',s.note,'evidence',s.evidence
        ) order by s.id) as criteria
        from public.url_work_quality_scores s where s.review_id=r.id
      ) scores on true
      where e.content_kpi_eligible=true and e.is_countable=true and coalesce(e.unified_source_state,'active')='active'
        and e.work_date>=date_trunc('month',$1::date) and e.work_date<date_trunc('month',$1::date)+interval '1 month'${eventClause}
      order by e.member_name,e.work_date,e.project`,
      eventParams,
    ),
    memberName
      ? Promise.resolve({ rows: [] })
      : query(`select r.*,coalesce((select json_agg(json_build_object('sourceRowNumber',s.source_row_number,'reasons',s.quarantine_reasons)) from public.work_source_rows s where s.sync_run_id=r.id and s.is_quarantined=true),'[]'::json) as quarantine_rows
      from public.work_sync_runs r where r.source='content_urls_sheet' order by r.created_at desc limit 1`),
    query(
      `with latest_run as (
        select id from public.work_sync_runs where source='content_urls_sheet'
        order by created_at desc limit 1
      ), source_counts as (
        select count(*)::int as source_rows
        from public.work_source_rows s join latest_run l on l.id=s.sync_run_id
        where ($2::text is null or s.normalized_payload->>'member'=$2)
          and case
            when s.normalized_payload->>'workDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
              then (s.normalized_payload->>'workDate')::date
            else null
          end>=date_trunc('month',$1::date)
          and case
            when s.normalized_payload->>'workDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
              then (s.normalized_payload->>'workDate')::date
            else null
          end<date_trunc('month',$1::date)+interval '1 month'
      ), event_counts as (
        select count(*)::int as active_events,
          count(*) filter(where e.content_kpi_eligible=true and e.is_countable=true)::int as eligible_events,
          count(*) filter(where e.content_kpi_eligible=true and e.is_countable=true and r.id is not null)::int as reviewed_events
        from public.url_work_events e
        left join public.url_work_quality_reviews r on r.work_event_id=e.id
        where ($2::text is null or e.member_name=$2)
          and coalesce(e.unified_source_state,'active')='active'
          and e.work_date>=date_trunc('month',$1::date)
          and e.work_date<date_trunc('month',$1::date)+interval '1 month'
      ) select source_rows,active_events,eligible_events,reviewed_events
      from source_counts cross join event_counts`,
      [month, memberName ?? null],
    ),
  ]);
  return {
    month,
    targets: targets.rows,
    projectResults: projects.rows,
    components: components.rows,
    results: results.rows,
    configs: configs.rows,
    overrides: overrides.rows,
    reviews: reviews.rows,
    reconciliation: reconciliation.rows[0] ?? null,
    reviewDiagnostics: reviewDiagnostics.rows[0] ?? {
      source_rows: 0,
      active_events: 0,
      eligible_events: 0,
      reviewed_events: 0,
    },
  };
}
