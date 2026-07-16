import crypto from "crypto";
import { transaction, query } from "../db";
import { getProjectGscMap } from "../env";
import {
  lifecycleMeasurementStrategy,
  validateProjectSettings,
} from "../domain/project-settings";

export async function listProjectOptions() {
  const [projects, sourceLabels, domains] = await Promise.all([
    query<any>(
      `select p.canonical_name,p.canonical_domain,p.lifecycle,p.gsc_property,p.gsc_ready,p.kpi_ready,
      s.version,s.effective_from::text,s.status,s.performance_weight_3m_pct,s.performance_weight_6m_pct,s.performance_weight_all_time_pct
      from public.projects p left join lateral(select * from public.project_settings_versions v where v.project_id=p.id
        order by (v.status='approved') desc,v.effective_from desc,v.id desc limit 1)s on true
      where p.is_active=true order by p.canonical_name`,
    ),
    query<any>(`select distinct normalized_payload->>'project' as project from public.work_source_rows
      where source='content_urls_sheet' and nullif(normalized_payload->>'project','') is not null`),
    query<any>(`select project,normalized_domain,count(*)::int as url_count from public.content_urls
      where coalesce(is_active,true)=true and nullif(project,'') is not null and nullif(normalized_domain,'') is not null
      group by project,normalized_domain order by project,url_count desc,normalized_domain`),
  ]);
  const approvedMap = getProjectGscMap();
  const names = [
    ...new Set(
      [
        ...Object.keys(approvedMap),
        ...projects.rows.map((row: any) => row.canonical_name),
        ...sourceLabels.rows.map((row: any) => row.project),
      ].filter(Boolean),
    ),
  ].sort();
  return names.map((name) => {
    const current =
      projects.rows.find((row: any) => row.canonical_name === name) ?? null;
    const detectedDomains = domains.rows
      .filter((row: any) => row.project === name)
      .map((row: any) => ({
        domain: row.normalized_domain,
        urlCount: Number(row.url_count),
      }));
    return {
      project: name,
      current,
      approvedGscProperty: approvedMap[name] ?? null,
      detectedDomains,
      canonicalDomain:
        detectedDomains[0]?.domain ?? current?.canonical_domain ?? null,
      domainConflict: detectedDomains.length > 1,
    };
  });
}

export async function listUnifiedProjectSettings() {
  const projects =
    await query<any>(`select p.id::text,p.canonical_name,p.canonical_domain,p.lifecycle,p.gsc_property,p.gsc_ready,p.kpi_ready,
    s.version,s.effective_from::text,s.status,s.performance_weight_3m_pct,s.performance_weight_6m_pct,
    s.performance_weight_all_time_pct,s.reason,s.updated_at
    from public.projects p left join lateral (
      select * from public.project_settings_versions v where v.project_id=p.id
      order by (v.status='approved') desc,v.effective_from desc,v.id desc limit 1
    ) s on true where p.is_active=true order by p.canonical_name`);
  const members = await query<any>(
    `select id::text,canonical_name,email from public.members where is_active=true order by canonical_name`,
  );
  return {
    projects: projects.rows,
    members: members.rows,
    options: await listProjectOptions(),
  };
}

export async function getUnifiedProjectConfig(projectName: string) {
  const [settings, options] = await Promise.all([
    listUnifiedProjectSettings(),
    listProjectOptions(),
  ]);
  const option = options.find((row) => row.project === projectName);
  if (!option) throw new Error("Project configuration option was not found.");
  return {
    project:
      settings.projects.find(
        (row: any) => row.canonical_name === projectName,
      ) ?? null,
    option,
  };
}

export async function saveUnifiedProjectSettings(raw: {
  projectName: string;
  lifecycle: string;
  canonicalDomain?: string | null;
  gscProperty?: string | null;
  threeMonthWeight: number | null;
  sixMonthWeight: number | null;
  allTimeWeight: number | null;
  version?: string;
  effectiveFrom?: string;
  effectiveMonth?: string;
  reason?: string;
  actor: string;
  approve?: boolean;
}) {
  const options = await listProjectOptions();
  const selected = options.find(
    (option) => option.project === raw.projectName?.trim(),
  );
  if (!selected)
    throw new Error(
      "Project must be selected from synced/configured project options.",
    );
  const allowedDomains = selected.detectedDomains.map((row) => row.domain);
  const canonicalDomain = (
    raw.canonicalDomain?.trim() ||
    selected.canonicalDomain ||
    ""
  ).toLowerCase();
  if (!canonicalDomain)
    throw new Error(
      "Canonical domain could not be resolved from synced URLs or approved configuration.",
    );
  if (allowedDomains.length && !allowedDomains.includes(canonicalDomain))
    throw new Error(
      "Canonical domain must be selected from the detected project domains.",
    );
  const effectiveFrom = /^\d{4}-\d{2}$/.test(raw.effectiveMonth ?? "")
    ? `${raw.effectiveMonth}-01`
    : raw.effectiveFrom?.slice(0, 10) ||
      `${new Date().toISOString().slice(0, 7)}-01`;
  const approvedGsc = selected.approvedGscProperty;
  const reason = raw.reason?.trim() || "";
  if (
    approvedGsc &&
    raw.gscProperty?.trim() &&
    raw.gscProperty.trim() !== approvedGsc &&
    !reason
  )
    throw new Error(
      "An audit reason is required when overriding the approved GSC property mapping.",
    );
  const gscProperty = raw.gscProperty?.trim() || approvedGsc || null;
  const gscReady = Boolean(gscProperty && canonicalDomain);
  const kpiReady = raw.lifecycle !== "new_project" && Boolean(canonicalDomain);
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        project: raw.projectName,
        lifecycle: raw.lifecycle,
        canonicalDomain,
        gscProperty,
        effectiveFrom,
        weights: [raw.threeMonthWeight, raw.sixMonthWeight, raw.allTimeWeight],
      }),
    )
    .digest("hex")
    .slice(0, 12);
  const version =
    raw.version?.trim() || `project-settings-${effectiveFrom}-${fingerprint}`;
  const input = validateProjectSettings({
    ...raw,
    canonicalDomain,
    gscProperty,
    gscReady,
    kpiReady,
    effectiveFrom,
    version,
    reason: reason || "initial_project_configuration",
    weights: {
      threeMonth: raw.threeMonthWeight,
      sixMonth: raw.sixMonthWeight,
      allTime: raw.allTimeWeight,
    },
  });
  const status = raw.approve ? "approved" : "draft";
  return transaction(async (client) => {
    const before = await client.query(
      `select * from public.projects where canonical_name=$1`,
      [input.projectName],
    );
    const previousApproved = before.rows[0]
      ? await client.query(
          `select 1 from public.project_settings_versions where project_id=$1 and status='approved' limit 1`,
          [before.rows[0].id],
        )
      : { rowCount: 0 };
    if (previousApproved.rowCount && raw.approve && !reason)
      throw new Error(
        "An audit reason is required when changing an approved Project Settings version.",
      );
    const project = await client.query(
      `insert into public.projects(canonical_name,created_at,updated_at)
      values($1,now(),now()) on conflict(canonical_name) do update set updated_at=now() returning id::text`,
      [input.projectName],
    );
    const projectId = project.rows[0].id;
    const settings = await client.query(
      `insert into public.project_settings_versions
      (project_id,version,effective_from,status,lifecycle,canonical_domain,gsc_property,gsc_ready,kpi_ready,
       performance_weight_3m_pct,performance_weight_6m_pct,performance_weight_all_time_pct,settings_payload,reason,
       created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,now(),now())
      on conflict(project_id,version) do update set effective_from=excluded.effective_from,status=excluded.status,
       lifecycle=excluded.lifecycle,canonical_domain=excluded.canonical_domain,gsc_property=excluded.gsc_property,
       gsc_ready=excluded.gsc_ready,kpi_ready=excluded.kpi_ready,performance_weight_3m_pct=excluded.performance_weight_3m_pct,
       performance_weight_6m_pct=excluded.performance_weight_6m_pct,performance_weight_all_time_pct=excluded.performance_weight_all_time_pct,
       reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()
      returning *`,
      [
        projectId,
        input.version,
        input.effectiveFrom,
        status,
        input.lifecycle,
        input.canonicalDomain,
        input.gscProperty,
        input.gscReady,
        input.kpiReady,
        input.weights.threeMonth,
        input.weights.sixMonth,
        input.weights.allTime,
        JSON.stringify({
          measurementStrategy: lifecycleMeasurementStrategy(input.lifecycle),
        }),
        input.reason,
        raw.actor,
        raw.approve ? raw.actor : null,
        raw.approve ? new Date().toISOString() : null,
      ],
    );
    await client.query(
      `insert into public.project_domain_mappings
      (project_id,normalized_domain,mapping_version,effective_from,status,reason,created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      on conflict(normalized_domain,mapping_version) do update set project_id=excluded.project_id,effective_from=excluded.effective_from,
       status=excluded.status,reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()`,
      [
        projectId,
        input.canonicalDomain,
        input.version,
        input.effectiveFrom,
        status,
        input.reason,
        raw.actor,
        raw.approve ? raw.actor : null,
        raw.approve ? new Date().toISOString() : null,
      ],
    );
    if (raw.approve) {
      await client.query(
        `update public.projects set canonical_domain=$2,lifecycle=$3,gsc_property=$4,gsc_ready=$5,kpi_ready=$6,updated_at=now() where id=$1`,
        [
          projectId,
          input.canonicalDomain,
          input.lifecycle,
          input.gscProperty,
          input.gscReady,
          input.kpiReady,
        ],
      );
      await client.query(
        `update public.content_urls set gsc_property=$2,gsc_ready=$3,updated_at=now() where project_id=$1`,
        [projectId, input.gscProperty, input.gscReady],
      );
      await client.query(
        `update public.url_work_events set kpi_ready=($2 and is_countable),
        readiness_issues=case when $2 then readiness_issues-'project_not_kpi_ready'
          else case when readiness_issues ? 'project_not_kpi_ready' then readiness_issues else readiness_issues||'["project_not_kpi_ready"]'::jsonb end end,
        updated_at=now() where project_id=$1`,
        [projectId, input.kpiReady],
      );
      await client.query(
        `insert into public.project_kpi_settings(project,measurement_strategy,performance_enabled_for_payroll,created_at,updated_at)
        values($1,$2,$3,now(),now()) on conflict(project) do update set measurement_strategy=excluded.measurement_strategy,
        performance_enabled_for_payroll=excluded.performance_enabled_for_payroll,updated_at=now()`,
        [
          input.projectName,
          lifecycleMeasurementStrategy(input.lifecycle),
          input.kpiReady,
        ],
      );
    }
    await client.query(
      `insert into public.application_audit_log(actor,action,entity_type,entity_id,before_value,after_value,reason)
      values($1,$2,'project_settings',$3,$4::jsonb,$5::jsonb,$6)`,
      [
        raw.actor,
        status === "approved" ? "approve" : "save_draft",
        projectId,
        JSON.stringify(before.rows[0] ?? null),
        JSON.stringify(settings.rows[0]),
        input.reason,
      ],
    );
    return settings.rows[0];
  });
}
