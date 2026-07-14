import { query, transaction, type Queryable } from "../db";
import { calculateQuantity, type QuantityEvent } from "../kpi/quantity";
import { rollupPersistedEventQuality, type PersistedEventQuality } from "../kpi/quality";
import { calculateSeoContent } from "../kpi/seo-content";
import { rollupPerformanceByMatureUnits } from "../kpi/member-rollup";
import { calculateFinalMonthlyKpi, type MonthlyComponent } from "../kpi/monthly-final";
import { scoreBase, type AuditableScore } from "../kpi/types";
import { mapScoreRow, nullableNumber, requiredNumber } from "./score-mapper";

export type TargetAllocationInput = { project: string; units: number; reason?: string | null };
export type MemberMonthlyTargetInput = {
  month: string;
  memberName: string;
  memberEmail?: string | null;
  targetUnits: number;
  baseTargetUnits?: number | null;
  activeWorkdayRatio?: number | null;
  adjustmentReason?: string | null;
  notes?: string | null;
  allocations?: TargetAllocationInput[];
  actor?: string | null;
};

export const monthKey = (value: string) => {
  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  if (!/^\d{4}-\d{2}-01$/.test(normalized)) throw new Error("Month must use YYYY-MM format.");
  return normalized;
};

const monthLabel = (value: string) => monthKey(value).slice(0, 7);
const round = (value: number) => Math.round(value * 10_000) / 10_000;

function validateTarget(input: MemberMonthlyTargetInput) {
  if (!input.memberName?.trim()) throw new Error("Member is required.");
  if (!Number.isFinite(input.targetUnits) || input.targetUnits < 0) throw new Error("Target units must be a non-negative number.");
  const ratio = input.activeWorkdayRatio ?? 1;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error("Active workday ratio must be between 0 and 1.");
  if (ratio !== 1 && !input.adjustmentReason?.trim()) throw new Error("Prorated targets require an explicit adjustment reason.");
  if (input.allocations?.length) {
    if (input.allocations.some((allocation) => !allocation.project?.trim() || !Number.isFinite(allocation.units) || allocation.units < 0))
      throw new Error("Every project allocation requires a project and non-negative units.");
    const total = input.allocations.reduce((sum, allocation) => sum + allocation.units, 0);
    if (Math.abs(total - input.targetUnits) >= 0.005) throw new Error(`Project allocations (${total}) must equal the member target (${input.targetUnits}).`);
  }
}

export async function upsertMemberMonthlyTarget(input: MemberMonthlyTargetInput) {
  validateTarget(input);
  const month = monthKey(input.month);
  return transaction(async (client) => {
    const identity = await client.query(`insert into public.members(canonical_name,email)
      values($1,$2) on conflict(canonical_name) do update set email=coalesce(excluded.email,public.members.email),updated_at=now()
      returning id::text`, [input.memberName.trim(), input.memberEmail ?? null]);
    const target = await client.query(`insert into public.monthly_member_month_targets
      (month_key,member_id,member_name,member_email,target_units,base_target_units,active_workday_ratio,target_adjustment_reason,
       target_version,notes,created_by,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,'member_target_v2',$9,$10,now(),now())
      on conflict(month_key,member_name) do update set member_id=excluded.member_id,member_email=excluded.member_email,
      target_units=excluded.target_units,base_target_units=excluded.base_target_units,active_workday_ratio=excluded.active_workday_ratio,
      target_adjustment_reason=excluded.target_adjustment_reason,notes=excluded.notes,updated_at=now()
      where public.monthly_member_month_targets.is_locked=false returning *`, [
      month, identity.rows[0].id, input.memberName.trim(), input.memberEmail ?? null, input.targetUnits,
      input.baseTargetUnits ?? input.targetUnits, input.activeWorkdayRatio ?? 1, input.adjustmentReason ?? null,
      input.notes ?? null, input.actor ?? null,
    ]);
    if (!target.rows[0]) throw new Error("The member-month target is locked and cannot be changed.");
    if (input.allocations) {
      await client.query(`delete from public.monthly_member_kpi_targets where member_month_target_id=$1 and is_locked=false`, [target.rows[0].id]);
      for (const allocation of input.allocations) {
        await client.query(`insert into public.monthly_member_kpi_targets
          (month_key,project,member_name,member_email,target_units,base_target_units,active_workday_ratio,target_adjustment_reason,
           target_version,member_month_target_id,allocation_units,allocation_reason,notes,created_at,updated_at)
          values($1,$2,$3,$4,$5,$5,$6,$7,'allocation_v2',$8,$5,$9,$10,now(),now())
          on conflict(month_key,project,member_name) do update set member_month_target_id=excluded.member_month_target_id,
          allocation_units=excluded.allocation_units,target_units=excluded.target_units,allocation_reason=excluded.allocation_reason,
          member_email=excluded.member_email,updated_at=now() where public.monthly_member_kpi_targets.is_locked=false`, [
          month, allocation.project.trim(), input.memberName.trim(), input.memberEmail ?? null, allocation.units,
          input.activeWorkdayRatio ?? 1, input.adjustmentReason ?? null, target.rows[0].id,
          allocation.reason ?? null, input.notes ?? null,
        ]);
      }
      const valid = await client.query(`select public.allocation_total_matches_target($1) as valid`, [target.rows[0].id]);
      if (!valid.rows[0]?.valid) throw new Error("Project allocation total does not match the member target.");
    }
    await upsertWorkflowState(client, month, input.memberName.trim(), "targets_ready", input.actor ?? null, { targetId: target.rows[0].id });
    return target.rows[0];
  });
}

/** Backward-compatible adapter for the previous project-target endpoint. */
export async function upsertMonthlyTarget(input: MemberMonthlyTargetInput & { project?: string }) {
  return upsertMemberMonthlyTarget({
    ...input,
    allocations: input.allocations ?? (input.project ? [{ project: input.project, units: input.targetUnits }] : undefined),
  });
}

async function upsertWorkflowState(client: Queryable, month: string, memberName: string, state: string, actor: string | null, prerequisites: Record<string, unknown> = {}) {
  await client.query(`insert into public.monthly_kpi_workflow_states
    (month_key,member_name,state,prerequisites,updated_by,created_at,updated_at)
    values($1,$2,$3,$4::jsonb,$5,now(),now())
    on conflict(month_key,member_name) do update set state=excluded.state,state_version=public.monthly_kpi_workflow_states.state_version+1,
    prerequisites=public.monthly_kpi_workflow_states.prerequisites||excluded.prerequisites,updated_by=excluded.updated_by,updated_at=now()`,
  [month, memberName, state, JSON.stringify(prerequisites), actor]);
}

async function upsertComponent(client: Queryable, month: string, memberName: string, key: string, score: AuditableScore, actor?: string | null) {
  await client.query(`insert into public.monthly_member_kpi_component_scores
    (month_key,member_name,component_key,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,
     status,reason,source_ids,audit_trail,diagnostics,data_as_of,calculated_at,approved_by,approved_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,now(),$17,
      case when $17::text is null then null else now() end,now(),now())
    on conflict(month_key,member_name,component_key,rule_version) do update set raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,
    coverage_pct=excluded.coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,override_reason=excluded.override_reason,
    status=excluded.status,reason=excluded.reason,source_ids=excluded.source_ids,audit_trail=excluded.audit_trail,diagnostics=excluded.diagnostics,
    data_as_of=excluded.data_as_of,calculated_at=now(),approved_by=coalesce(excluded.approved_by,public.monthly_member_kpi_component_scores.approved_by),
    approved_at=coalesce(excluded.approved_at,public.monthly_member_kpi_component_scores.approved_at),updated_at=now()`, [
    month, memberName, key, score.rawPct, score.payablePct, score.coveragePct, score.confidence, score.sourceCohort,
    score.ruleVersion, score.overrideReason, score.state, score.reason, JSON.stringify(score.sourceIds), JSON.stringify(score.auditTrail),
    JSON.stringify(score.diagnostics), score.dataAsOf, actor ?? null,
  ]);
}

async function loadMemberEvents(client: Queryable, month: string, memberName: string) {
  const result = await client.query(`select e.id::text,e.project,e.member_name,e.work_type,e.work_date::text,e.unit_value,
    e.status,e.is_countable,e.unit_rule_id::text,e.unit_rule_version,e.canonical_url_snapshot,e.source,e.source_item_id,
    r.review_status,r.quality_pct,r.exclusion_reason,r.admin_note,r.rubric_version_snapshot
    from public.url_work_events e left join public.url_work_quality_reviews r on r.work_event_id=e.id
    where e.member_name=$2 and e.work_date>=date_trunc('month',$1::date)
      and e.work_date<date_trunc('month',$1::date)+interval '1 month'
    order by e.project,e.work_date,e.id`, [month, memberName]);
  return result.rows;
}

async function persistProjectDiagnostics(client: Queryable, month: string, memberName: string, events: any[], memberTargetUnits: number | null, performanceRows: any[]) {
  const projects = [...new Set(events.map((event) => String(event.project)))];
  for (const project of projects) {
    const projectEvents = events.filter((event) => event.project === project && event.is_countable && ["completed", "approved"].includes(event.status));
    const actualUnits = projectEvents.reduce((sum, event) => sum + requiredNumber(event.unit_value, "event unit value"), 0);
    const reviewed = projectEvents.filter((event) => event.review_status === "approved" && nullableNumber(event.quality_pct) !== null);
    const resolved = projectEvents.filter((event) => event.review_status === "approved" || (event.review_status === "excluded" && Boolean((event.exclusion_reason ?? event.admin_note)?.trim())));
    const reviewedUnits = reviewed.reduce((sum, event) => sum + requiredNumber(event.unit_value, "event unit value"), 0);
    const resolvedUnits = resolved.reduce((sum, event) => sum + requiredNumber(event.unit_value, "event unit value"), 0);
    const qualityPct = reviewedUnits > 0
      ? reviewed.reduce((sum, event) => sum + nullableNumber(event.quality_pct)! * requiredNumber(event.unit_value, "event unit value"), 0) / reviewedUnits
      : null;
    const qualityCoveragePct = actualUnits > 0 ? resolvedUnits / actualUnits * 100 : null;
    const performanceRow = performanceRows.find((row) => row.project === project);
    const performance = mapScoreRow(performanceRow, { ruleVersion: "performance_v2", state: "insufficient_data", reason: "performance_not_refreshed" });
    const contributionPct = memberTargetUnits && memberTargetUnits > 0 ? actualUnits / memberTargetUnits * 100 : null;
    await client.query(`insert into public.monthly_member_project_kpi_results
      (month_key,project,member_name,quantity_raw_pct,quantity_payable_pct,quantity_coverage_pct,quality_raw_pct,quality_payable_pct,
       quality_coverage_pct,seo_content_raw_pct,seo_content_payable_pct,performance_raw_pct,performance_payable_pct,
       performance_coverage_pct,confidence,source_cohort,rule_version,override_reason,status,source_ids,diagnostics,calculated_at,created_at,updated_at)
      values($1,$2,$3,$4,null,100,$5,$5,$6,null,null,$7,$8,$9,$10,$11,'member_month_diagnostic_v3',$12,$13,$14::jsonb,$15::jsonb,now(),now(),now())
      on conflict(month_key,project,member_name,rule_version) do update set quantity_raw_pct=excluded.quantity_raw_pct,
      quality_raw_pct=excluded.quality_raw_pct,quality_payable_pct=excluded.quality_payable_pct,quality_coverage_pct=excluded.quality_coverage_pct,
      performance_raw_pct=excluded.performance_raw_pct,performance_payable_pct=excluded.performance_payable_pct,
      performance_coverage_pct=excluded.performance_coverage_pct,confidence=excluded.confidence,source_cohort=excluded.source_cohort,
      override_reason=excluded.override_reason,status=excluded.status,source_ids=excluded.source_ids,diagnostics=excluded.diagnostics,
      calculated_at=now(),updated_at=now()`, [
      month, project, memberName, contributionPct, qualityPct, qualityCoveragePct,
      performance.rawPct, performance.payablePct, performance.coveragePct, performance.confidence, performance.sourceCohort,
      performance.overrideReason, qualityCoveragePct === 100 && qualityPct !== null ? "scored" : "incomplete",
      JSON.stringify(projectEvents.map((event) => event.id)), JSON.stringify({ actualUnits, memberTargetUnits, quantityMeaning: "project_contribution_to_member_target_not_payroll_cap", qualityAggregation: "event_unit_weighted_average", reviewedUnits, resolvedUnits, eligibleUnits: actualUnits, reviewedEvents: reviewed.length, eligibleEvents: projectEvents.length }),
    ]);
  }
}

async function calculateMemberMonth(client: Queryable, month: string, memberName: string, actor?: string | null) {
  const targetResult = await client.query(`select * from public.monthly_member_month_targets where month_key=$1 and member_name=$2 limit 1`, [month, memberName]);
  const target = targetResult.rows[0] ?? null;
  const events = await loadMemberEvents(client, month, memberName);
  const quantityEvents: QuantityEvent[] = events.map((event) => ({
    id: event.id,
    unitValue: requiredNumber(event.unit_value, "event unit value"),
    status: event.status,
    isCountable: Boolean(event.is_countable),
    workDate: event.work_date,
    unitRuleId: event.unit_rule_id,
    unitRuleVersion: event.unit_rule_version,
  }));
  const quantity = calculateQuantity({ events: quantityEvents, targetUnits: nullableNumber(target?.target_units), month: month.slice(0, 7), ruleVersion: "quantity_member_month_v3" });
  const eligible = events.filter((event) => event.is_countable && ["completed", "approved"].includes(event.status));
  const reviews: PersistedEventQuality[] = eligible.map((event) => ({
    eventId: event.id,
    unitValue: requiredNumber(event.unit_value, "event unit value"),
    status: event.review_status ?? "pending",
    qualityPct: nullableNumber(event.quality_pct),
    exclusionReason: event.exclusion_reason ?? event.admin_note ?? null,
    rubricVersion: event.rubric_version_snapshot,
  }));
  const quality = rollupPersistedEventQuality({ eligibleEvents: eligible.map((event) => ({ id: event.id, unitValue: requiredNumber(event.unit_value, "event unit value") })), reviews, month: month.slice(0, 7) });
  const calculatedSeoContent = calculateSeoContent(quantity, quality, "seo_content_member_month_v3");
  const seoContent = scoreBase({
    ...calculatedSeoContent,
    diagnostics: {
      ...calculatedSeoContent.diagnostics,
      actualUnits: quantity.actualUnits,
      targetUnits: quantity.targetUnits,
      quantityRawPct: quantity.rawPct,
      quantityPct: quantity.payablePct,
      qualityPct: quality.payablePct,
      qualityCoveragePct: quality.coveragePct,
      qualityAggregation: "event_unit_weighted_average",
      equalEventQualityDiagnosticPct: quality.diagnostics.equalEventDiagnosticPct ?? null,
    },
  });
  const performanceResult = await client.query(`select * from public.performance_project_member_month_results
    where month_key=$1 and member_name=$2 order by project,calculated_at desc`, [month, memberName]);
  const latestPerformance = [...new Map(performanceResult.rows.map((row) => [row.project, row])).values()];
  const performance = rollupPerformanceByMatureUnits(latestPerformance.map((row: any) => ({
    project: row.project,
    matureEventUnits: requiredNumber(row.mature_event_units, "mature event units"),
    candidateEventUnits: requiredNumber(row.candidate_event_units, "candidate event units"),
    score: mapScoreRow(row, { ruleVersion: "performance_v2", state: "insufficient_data", reason: "performance_not_refreshed" }),
  })));
  await upsertComponent(client, month, memberName, "seo_content", seoContent);
  await upsertComponent(client, month, memberName, "seo_performance", performance);
  await persistProjectDiagnostics(client, month, memberName, events, nullableNumber(target?.target_units), latestPerformance);
  await upsertWorkflowState(client, month, memberName, "calculated", actor ?? null, { quantityState: quantity.state, qualityState: quality.state, performanceState: performance.state });
  return { memberName, target, quantity, quality, seoContent, performance };
}

async function calculateFinalWithClient(client: Queryable, input: { month: string; memberName: string; acknowledgeMissingPerformance?: boolean; missingPerformanceReason?: string | null }) {
  const definitions = await client.query(`select * from public.monthly_kpi_component_definitions where version='components_v2' and is_active=true order by id`);
  const scores = await client.query(`select distinct on(component_key) * from public.monthly_member_kpi_component_scores
    where month_key=$1 and member_name=$2 order by component_key,calculated_at desc`, [input.month, input.memberName]);
  const components: MonthlyComponent[] = definitions.rows.map((definition) => {
    const row = scores.rows.find((score) => score.component_key === definition.component_key);
    return {
      key: definition.component_key,
      weightPct: requiredNumber(definition.default_weight_pct, "component weight"),
      required: Boolean(definition.is_required),
      score: mapScoreRow(row, { ruleVersion: "component_missing", state: "incomplete", reason: "component_missing" }),
    };
  });
  return calculateFinalMonthlyKpi({ components, acknowledgeMissingPerformance: input.acknowledgeMissingPerformance, missingPerformanceReason: input.missingPerformanceReason });
}

export async function calculateMonthlyKpi(monthInput: string, memberName?: string, actor?: string | null) {
  const month = monthKey(monthInput);
  return transaction(async (client) => {
    const membersResult = memberName
      ? { rows: [{ member_name: memberName }] }
      : await client.query(`select member_name from public.monthly_member_month_targets where month_key=$1
          union select distinct member_name from public.url_work_events where work_date>=date_trunc('month',$1::date)
            and work_date<date_trunc('month',$1::date)+interval '1 month' order by member_name`, [month]);
    const results = [];
    for (const row of membersResult.rows) {
      const calculated = await calculateMemberMonth(client, month, row.member_name, actor);
      const preview = await calculateFinalWithClient(client, { month, memberName: row.member_name });
      results.push({ ...calculated, preview });
    }
    return { month, members: results.length, results };
  });
}

export async function saveManualComponent(input: { month: string; memberName: string; componentKey: "discipline" | "social_video"; scorePct: number | null; reason?: string | null; actor: string }) {
  if (input.scorePct === null) throw new Error("Manual component score is required; missing values remain pending and cannot be saved as zero.");
  if (!Number.isFinite(input.scorePct) || input.scorePct < 0 || input.scorePct > 100) throw new Error("Manual component score must be between 0 and 100.");
  if (!input.memberName?.trim()) throw new Error("Member is required.");
  const month = monthKey(input.month);
  const score = scoreBase({
    ruleVersion: "manual_component_v2",
    state: "approved",
    rawPct: input.scorePct,
    payablePct: input.scorePct,
    coveragePct: 100,
    confidence: "medium",
    overrideReason: input.reason ?? null,
    auditTrail: [{ action: "manual_component_approved", actor: input.actor, at: new Date().toISOString(), reason: input.reason ?? null }],
  });
  await transaction(async (client) => {
    const before = await client.query(`select * from public.monthly_member_kpi_component_scores where month_key=$1 and member_name=$2 and component_key=$3 order by calculated_at desc limit 1`, [month, input.memberName, input.componentKey]);
    await upsertComponent(client, month, input.memberName, input.componentKey, score, input.actor);
    await client.query(`insert into public.kpi_override_audit_log
      (month_key,member_name,component_key,entity_type,before_value,after_value,reason,actor,action)
      values($1,$2,$3,'monthly_component',$4::jsonb,$5::jsonb,$6,$7,'manual_component_save')`, [
      month, input.memberName, input.componentKey, JSON.stringify(before.rows[0] ?? null), JSON.stringify(score), input.reason ?? "Monthly manual component approval", input.actor,
    ]);
  });
  return score;
}

export async function calculateMemberFinal(input: { month: string; memberName: string; acknowledgeMissingPerformance?: boolean; missingPerformanceReason?: string | null }) {
  const month = monthKey(input.month);
  const client = await import("../db");
  return calculateFinalWithClient({ query: client.query }, { ...input, month });
}

export async function listMonthlyKpiAudit(monthInput: string, memberName?: string) {
  const month = monthKey(monthInput);
  const params: unknown[] = [month];
  if (memberName) params.push(memberName);
  const memberClause = memberName ? " and member_name=$2" : "";
  const eventMemberClause = memberName ? " and e.member_name=$2" : "";
  const [members, targets, allocations, projects, componentDefinitions, components, results, overrides, events, performance, workflow, runs, differences, approvals, reconciliation] = await Promise.all([
    query(`select member_name,max(member_email) as member_email,count(*) filter(where source='target')::int as has_target,count(*) filter(where source='event')::int as event_count
      from (select member_name,member_email,'target'::text source from public.monthly_member_month_targets where month_key=$1
        union all select member_name,member_email,'event' from public.url_work_events where work_date>=date_trunc('month',$1::date)
        and work_date<date_trunc('month',$1::date)+interval '1 month') x where true${memberClause} group by member_name order by member_name`, params),
    query(`select * from public.monthly_member_month_targets where month_key=$1${memberClause} order by member_name`, params),
    query(`select * from public.monthly_member_kpi_targets where month_key=$1${memberClause} order by member_name,project`, params),
    query(`select * from public.monthly_member_project_kpi_results where month_key=$1${memberClause} order by member_name,project`, params),
    query(`select * from public.monthly_kpi_component_definitions where version='components_v2' and is_active=true order by id`),
    query(`select distinct on(member_name,component_key) * from public.monthly_member_kpi_component_scores where month_key=$1${memberClause}
      order by member_name,component_key,calculated_at desc`, params),
    query(`select * from public.monthly_member_kpi_results where month_key=$1${memberClause} order by member_name,version desc`, params),
    query(`select * from public.kpi_override_audit_log where month_key=$1${memberClause} order by created_at desc`, params),
    query(`select e.id::text as work_event_id,e.content_url_id::text,e.project,e.member_name,e.work_type,e.work_date::text,e.status,e.is_countable,
      e.unit_value,e.unit_rule_id::text,e.unit_rule_version,e.canonical_url_snapshot,e.source,e.source_item_id,e.source_status,
      e.approved_by as event_approved_by,e.approved_at as event_approved_at,e.approval_reason as event_approval_reason,
      r.review_status,r.quality_pct,r.rubric_version_snapshot,r.exclusion_reason,r.admin_note,r.reviewed_by,r.reviewed_at
      from public.url_work_events e left join public.url_work_quality_reviews r on r.work_event_id=e.id
      where e.work_date>=date_trunc('month',$1::date) and e.work_date<date_trunc('month',$1::date)+interval '1 month'${eventMemberClause}
      order by e.member_name,e.project,e.work_date,e.id`, params),
    query(`select * from public.performance_project_member_month_results where month_key=$1${memberClause} order by member_name,project`, params),
    query(`select * from public.monthly_kpi_workflow_states where month_key=$1${memberClause} order by member_name`, params),
    query(`select * from public.monthly_kpi_calculation_runs where month_key=$1${memberName ? " and (member_name=$2 or member_name is null)" : ""} order by started_at desc limit 100`, params),
    query(`select * from public.monthly_kpi_shadow_differences where month_key=$1${memberClause} order by member_name,component_key,id`, params),
    query(`select * from public.monthly_kpi_shadow_approvals where month_key=$1${memberClause} order by member_name nulls first,approval_role`, params),
    memberName ? Promise.resolve({ rows: [] }) : query(`select r.*,coalesce((select json_agg(json_build_object('sourceRowNumber',s.source_row_number,'sourceItemId',s.source_item_id,'reasons',s.quarantine_reasons)) from public.work_source_rows s where s.sync_run_id=r.id and s.is_quarantined=true),'[]'::json) as quarantine_rows
      from public.work_sync_runs r order by r.created_at desc limit 1`),
  ]);
  return {
    month,
    members: members.rows,
    targets: targets.rows,
    allocations: allocations.rows,
    projectResults: projects.rows,
    componentDefinitions: componentDefinitions.rows,
    components: components.rows,
    results: results.rows,
    overrides: overrides.rows,
    events: events.rows,
    reviews: events.rows,
    performance: performance.rows,
    workflow: workflow.rows,
    runs: runs.rows,
    differences: differences.rows,
    approvals: approvals.rows,
    reconciliation: reconciliation.rows[0] ?? null,
  };
}
