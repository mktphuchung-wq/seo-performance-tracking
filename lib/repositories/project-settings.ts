import { transaction, query } from "../db";
import { lifecycleMeasurementStrategy, validateContributionWeights, validateProjectSettings } from "../domain/project-settings";

export async function listUnifiedProjectSettings() {
  const projects = await query<any>(`select p.id::text,p.canonical_name,p.canonical_domain,p.lifecycle,p.gsc_property,p.gsc_ready,p.kpi_ready,
    s.version,s.effective_from::text,s.status,s.performance_weight_3m_pct,s.performance_weight_6m_pct,
    s.performance_weight_all_time_pct,s.reason,s.updated_at
    from public.projects p left join lateral (
      select * from public.project_settings_versions v where v.project_id=p.id
      order by (v.status='approved') desc,v.effective_from desc,v.id desc limit 1
    ) s on true where p.is_active=true order by p.canonical_name`);
  const contributions = await query<any>(`select w.month_key::text,m.canonical_name as member_name,p.canonical_name as project,
    w.weight_pct,w.version,w.reason,w.approved_at
    from public.member_project_contribution_weights w
    join public.members m on m.id=w.member_id join public.projects p on p.id=w.project_id
    order by w.month_key desc,m.canonical_name,p.canonical_name`);
  const members = await query<any>(`select id::text,canonical_name,email from public.members where is_active=true order by canonical_name`);
  return { projects: projects.rows, members: members.rows, contributions: contributions.rows };
}

export async function saveUnifiedProjectSettings(raw: {
  projectName: string; lifecycle: string; canonicalDomain: string; gscProperty?: string | null;
  gscReady: boolean; kpiReady: boolean; threeMonthWeight: number | null; sixMonthWeight: number | null;
  allTimeWeight: number | null; version: string; effectiveFrom: string; reason: string; actor: string; approve?: boolean;
}) {
  const input = validateProjectSettings({
    ...raw,
    weights: { threeMonth: raw.threeMonthWeight, sixMonth: raw.sixMonthWeight, allTime: raw.allTimeWeight },
  });
  const status = raw.approve ? "approved" : "draft";
  return transaction(async (client) => {
    const before = await client.query(`select * from public.projects where canonical_name=$1`, [input.projectName]);
    const project = await client.query(`insert into public.projects(canonical_name,created_at,updated_at)
      values($1,now(),now()) on conflict(canonical_name) do update set updated_at=now() returning id::text`, [input.projectName]);
    const projectId = project.rows[0].id;
    const settings = await client.query(`insert into public.project_settings_versions
      (project_id,version,effective_from,status,lifecycle,canonical_domain,gsc_property,gsc_ready,kpi_ready,
       performance_weight_3m_pct,performance_weight_6m_pct,performance_weight_all_time_pct,settings_payload,reason,
       created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,now(),now())
      on conflict(project_id,version) do update set effective_from=excluded.effective_from,status=excluded.status,
       lifecycle=excluded.lifecycle,canonical_domain=excluded.canonical_domain,gsc_property=excluded.gsc_property,
       gsc_ready=excluded.gsc_ready,kpi_ready=excluded.kpi_ready,performance_weight_3m_pct=excluded.performance_weight_3m_pct,
       performance_weight_6m_pct=excluded.performance_weight_6m_pct,performance_weight_all_time_pct=excluded.performance_weight_all_time_pct,
       reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()
      returning *`, [projectId,input.version,input.effectiveFrom,status,input.lifecycle,input.canonicalDomain,input.gscProperty,
      input.gscReady,input.kpiReady,input.weights.threeMonth,input.weights.sixMonth,input.weights.allTime,
      JSON.stringify({ measurementStrategy: lifecycleMeasurementStrategy(input.lifecycle) }),input.reason,raw.actor,
      raw.approve ? raw.actor : null,raw.approve ? new Date().toISOString() : null]);
    await client.query(`insert into public.project_domain_mappings
      (project_id,normalized_domain,mapping_version,effective_from,status,reason,created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      on conflict(normalized_domain,mapping_version) do update set project_id=excluded.project_id,effective_from=excluded.effective_from,
       status=excluded.status,reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()`,
      [projectId,input.canonicalDomain,input.version,input.effectiveFrom,status,input.reason,raw.actor,
       raw.approve ? raw.actor : null,raw.approve ? new Date().toISOString() : null]);
    if(raw.approve){
      await client.query(`update public.projects set canonical_domain=$2,lifecycle=$3,gsc_property=$4,gsc_ready=$5,kpi_ready=$6,updated_at=now() where id=$1`,
        [projectId,input.canonicalDomain,input.lifecycle,input.gscProperty,input.gscReady,input.kpiReady]);
      await client.query(`update public.content_urls set gsc_property=$2,gsc_ready=$3,updated_at=now() where project_id=$1`,
        [projectId,input.gscProperty,input.gscReady]);
      await client.query(`update public.url_work_events set kpi_ready=($2 and is_countable),
        readiness_issues=case when $2 then readiness_issues-'project_not_kpi_ready'
          else case when readiness_issues ? 'project_not_kpi_ready' then readiness_issues else readiness_issues||'["project_not_kpi_ready"]'::jsonb end end,
        updated_at=now() where project_id=$1`,[projectId,input.kpiReady]);
      await client.query(`insert into public.project_kpi_settings(project,measurement_strategy,performance_enabled_for_payroll,created_at,updated_at)
        values($1,$2,$3,now(),now()) on conflict(project) do update set measurement_strategy=excluded.measurement_strategy,
        performance_enabled_for_payroll=excluded.performance_enabled_for_payroll,updated_at=now()`,
        [input.projectName,lifecycleMeasurementStrategy(input.lifecycle),input.kpiReady]);
    }
    await client.query(`insert into public.application_audit_log(actor,action,entity_type,entity_id,before_value,after_value,reason)
      values($1,$2,'project_settings',$3,$4::jsonb,$5::jsonb,$6)`, [raw.actor,status==='approved'?'approve':'save_draft',projectId,
      JSON.stringify(before.rows[0]??null),JSON.stringify(settings.rows[0]),input.reason]);
    return settings.rows[0];
  });
}

export async function saveMemberProjectContributionWeights(input: {
  month: string; memberName: string; version: string; reason: string; actor: string;
  rows: Array<{ projectName: string; weightPct: number }>;
}) {
  const rows = validateContributionWeights(input.rows);
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("Month must use YYYY-MM.");
  if (!input.memberName.trim() || !input.version.trim() || !input.reason.trim()) throw new Error("Member, version, and audit reason are required.");
  return transaction(async (client) => {
    const member = await client.query(`select id::text from public.members where canonical_name=$1 and is_active=true`, [input.memberName.trim()]);
    if (!member.rows[0]) throw new Error("Member identity was not found.");
    for (const row of rows) {
      const project = await client.query(`select id::text from public.projects where canonical_name=$1 and is_active=true`, [row.projectName]);
      if (!project.rows[0]) throw new Error(`Project was not found: ${row.projectName}`);
      await client.query(`insert into public.member_project_contribution_weights
        (month_key,member_id,project_id,weight_pct,version,reason,created_by,approved_by,approved_at,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$7,now(),now(),now())
        on conflict(month_key,member_id,project_id,version) do update set weight_pct=excluded.weight_pct,reason=excluded.reason,
        approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()`,
        [`${input.month}-01`,member.rows[0].id,project.rows[0].id,row.weightPct,input.version.trim(),input.reason.trim(),input.actor]);
    }
    await client.query(`insert into public.application_audit_log(actor,action,entity_type,entity_id,after_value,reason)
      values($1,'approve_weights','member_project_contribution',$2,$3::jsonb,$4)`, [input.actor,`${input.month}:${input.memberName}`,
      JSON.stringify({version:input.version,rows}),input.reason.trim()]);
    return { month: input.month, memberName: input.memberName, version: input.version, rows };
  });
}
