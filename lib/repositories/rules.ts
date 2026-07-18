import { query, transaction } from "../db";

export type WorkUnitRuleInput = {
  project?: string | null;
  memberName?: string | null;
  workType: "new_content" | "audit" | "update" | "portfolio";
  difficulty: string;
  unitValue: number;
};

export type QualityCriterionInput = {
  key: string;
  name: string;
  weightPct: number;
  allowsNa?: boolean;
};

export async function listRuleRegistry() {
  const [performance, settings, units, quality, finalKpi, audit] = await Promise.all([
    query<any>(`select r.id::text,p.canonical_name project,r.version,r.lifecycle,r.effective_from::text,r.effective_to::text,
      r.status,r.reason,r.created_by,r.approved_by,r.approved_at,r.min_eligible_events,r.min_known_coverage_pct,r.minimum_short_window_days
      from public.project_performance_rule_versions r join public.projects p on p.id=r.project_id
      order by r.effective_from desc,r.id desc`),
    query<any>(`select s.id::text,p.canonical_name project,s.version,s.lifecycle,s.effective_from::text,s.effective_to::text,
      s.status,s.reason,s.created_by,s.approved_by,s.approved_at,s.performance_weight_3m_pct,s.performance_weight_6m_pct,s.performance_weight_all_time_pct
      from public.project_settings_versions s join public.projects p on p.id=s.project_id
      order by s.effective_from desc,s.id desc`),
    query<any>(`select id::text,project,member_name,work_type,difficulty,unit_value,is_active,rule_version,valid_from::text,valid_to::text,
      coalesce(to_jsonb(kpi_work_unit_rules)->>'status',case when is_active then 'approved' else 'retired' end) status,
      coalesce(to_jsonb(kpi_work_unit_rules)->>'reason',notes,'Imported legacy rule') reason,
      created_by,to_jsonb(kpi_work_unit_rules)->>'approved_by' approved_by,
      to_jsonb(kpi_work_unit_rules)->>'approved_at' approved_at
      from public.kpi_work_unit_rules order by valid_from desc,id desc`),
    query<any>(`select v.id::text,r.rubric_key,r.name,r.project,r.work_type,v.version,v.status,v.total_weight_pct,
      v.effective_from::text,to_jsonb(v)->>'effective_to' effective_to,
      coalesce(to_jsonb(v)->>'reason','Imported legacy rubric') reason,
      to_jsonb(v)->>'created_by' created_by,v.approved_by,v.approved_at,
      coalesce(json_agg(json_build_object('key',c.criterion_key,'name',c.criterion_name,'weightPct',c.weight_pct,'allowsNa',c.allows_na)
        order by c.display_order) filter(where c.id is not null),'[]'::json) criteria
      from public.kpi_quality_rubric_versions v join public.kpi_quality_rubrics r on r.id=v.rubric_id
      left join public.kpi_quality_criteria c on c.rubric_version_id=v.id group by v.id,r.id order by v.effective_from desc nulls last,v.id desc`),
    query<any>(`select t.id::text,t.template_key,t.version,t.name,t.status,t.effective_from::text,t.effective_to::text,t.reason,
      t.created_by,t.approved_by,t.approved_at,coalesce(json_agg(json_build_object('componentKey',c.component_key,'weightPct',c.weight_pct,
      'isRequired',c.is_required,'allowsNa',c.allows_na) order by c.display_order) filter(where c.id is not null),'[]'::json) components
      from public.kpi_templates t left join public.kpi_template_components c on c.template_id=t.id
      group by t.id order by t.effective_from desc nulls last,t.id desc`),
    query<any>(`select id::text,actor,action,entity_type,entity_id,reason,created_at from public.application_audit_log
      where entity_type in ('project_settings','project_performance_rule','work_unit_rule_version','quality_rubric_version','kpi_template')
      order by created_at desc limit 100`),
  ]);
  return { performance: performance.rows, projectSettings: settings.rows, workUnits: units.rows, quality: quality.rows, finalKpi: finalKpi.rows, audit: audit.rows };
}

export async function saveWorkUnitRuleVersion(input: {
  version: string; effectiveFrom: string; reason: string; actor: string; approve: boolean; rules: WorkUnitRuleInput[];
}) {
  if (!input.version.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || !input.reason.trim()) throw new Error("Version, effective date, and audit reason are required.");
  if (!input.rules.length || input.rules.some((rule) => !rule.workType || !rule.difficulty.trim() || !Number.isFinite(rule.unitValue) || rule.unitValue < 0)) throw new Error("At least one valid work-unit rule is required.");
  return transaction(async (client) => {
    const ids: string[] = [];
    for (const rule of input.rules) {
      const saved = await client.query(`insert into public.kpi_work_unit_rules(project,member_name,work_type,difficulty,unit_value,is_active,
        rule_version,valid_from,created_by,status,reason,approved_by,approved_at,notes,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11,now(),now()) returning id::text`, [
        rule.project?.trim() || null,rule.memberName?.trim() || null,rule.workType,rule.difficulty.trim(),rule.unitValue,input.approve,
        input.version.trim(),input.effectiveFrom,input.actor,input.approve ? "approved" : "draft",input.reason.trim(),input.approve ? input.actor : null,input.approve ? new Date().toISOString() : null,
      ]);
      ids.push(String(saved.rows[0].id));
    }
    await client.query(`insert into public.application_audit_log(actor,action,entity_type,entity_id,after_value,reason)
      values($1,$2,'work_unit_rule_version',$3,$4::jsonb,$5)`, [input.actor,input.approve ? "approve" : "save_draft",input.version,JSON.stringify({ ids, rules: input.rules }),input.reason.trim()]);
    return { version: input.version, status: input.approve ? "approved" : "draft", ids };
  });
}

export async function saveQualityRuleVersion(input: {
  rubricKey: string; name: string; project?: string | null; workType: "new_content" | "audit" | "update";
  version: string; effectiveFrom: string; reason: string; actor: string; approve: boolean; criteria: QualityCriterionInput[];
}) {
  const total = input.criteria.reduce((sum, row) => sum + Number(row.weightPct), 0);
  if (!input.rubricKey.trim() || !input.name.trim() || !input.version.trim() || !input.reason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new Error("Rubric, version, effective date, and audit reason are required.");
  if (!input.criteria.length || input.criteria.some((row) => !/^[a-z][a-z0-9_]*$/.test(row.key) || !row.name.trim() || row.weightPct <= 0) || Math.abs(total - 100) > 0.0001) throw new Error(`Quality criteria weights must total 100%; received ${total}.`);
  return transaction(async (client) => {
    const rubric = await client.query(`insert into public.kpi_quality_rubrics(rubric_key,name,project,work_type,is_active,created_at,updated_at)
      values($1,$2,$3,$4,true,now(),now()) on conflict(rubric_key) do update set name=excluded.name,project=excluded.project,work_type=excluded.work_type,updated_at=now() returning id::text`,
      [input.rubricKey.trim(),input.name.trim(),input.project?.trim() || null,input.workType]);
    const version = await client.query(`insert into public.kpi_quality_rubric_versions(rubric_id,version,status,total_weight_pct,effective_from,reason,created_by,approved_by,approved_at,created_at)
      values($1,$2,$3,100,$4,$5,$6,$7,$8,now()) returning id::text`, [rubric.rows[0].id,input.version.trim(),input.approve ? "approved" : "draft",input.effectiveFrom,input.reason.trim(),input.actor,input.approve ? input.actor : null,input.approve ? new Date().toISOString() : null]);
    for (const [index, criterion] of input.criteria.entries()) await client.query(`insert into public.kpi_quality_criteria(project,criterion_key,criterion_name,review_level,weight_pct,display_order,is_active,description,
      rubric_version_id,work_type,allows_na,created_at,updated_at) values($1,$2,$3,'url',$4,$5,true,$3,$6,$7,$8,now(),now())`,
      [input.project?.trim() || null,criterion.key,criterion.name.trim(),criterion.weightPct,(index + 1) * 10,version.rows[0].id,input.workType,Boolean(criterion.allowsNa)]);
    await client.query(`insert into public.application_audit_log(actor,action,entity_type,entity_id,after_value,reason)
      values($1,$2,'quality_rubric_version',$3,$4::jsonb,$5)`, [input.actor,input.approve ? "approve" : "save_draft",version.rows[0].id,JSON.stringify({ rubricKey: input.rubricKey, version: input.version, criteria: input.criteria }),input.reason.trim()]);
    return { id: version.rows[0].id, version: input.version, status: input.approve ? "approved" : "draft" };
  });
}
