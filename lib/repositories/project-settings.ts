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
      p.gsc_access_status,p.gsc_permission_level,p.gsc_verified_at,p.gsc_verification_id,p.include_subdomains,
      s.version,s.effective_from::text,s.status,s.performance_weight_3m_pct,s.performance_weight_6m_pct,s.performance_weight_all_time_pct,
      r.fallback_window_days,r.minimum_short_window_days,r.neutral_score_pct,r.confidence_high_factor,
      r.confidence_medium_factor,r.confidence_low_factor,r.unknown_score_pct,r.observed_zero_policy,
      r.max_provisional_payable_pct,r.pm_review_threshold_pct,r.min_eligible_events,
      r.min_known_coverage_pct,r.min_post_impressions,r.range_fallback_policy,
      gv.domain_scope_status as gsc_domain_scope_status,gv.test_query_status as gsc_test_query_status,
      gv.expires_at as gsc_verification_expires_at,gv.error_code as gsc_verification_error_code,
      gv.diagnostics as gsc_verification_diagnostics
      from public.projects p left join lateral(select * from public.project_settings_versions v where v.project_id=p.id
        order by (v.status='approved') desc,v.effective_from desc,v.id desc limit 1)s on true
      left join lateral(select * from public.project_performance_rule_versions v where v.project_id=p.id
        order by (v.status='approved') desc,v.effective_from desc,v.id desc limit 1)r on true
      left join lateral(select * from public.project_gsc_verifications v where v.project_id=p.id
        order by v.created_at desc,v.id desc limit 1)gv on true
      where p.is_active=true order by p.canonical_name`,
    ),
    query<any>(`select distinct normalized_payload->>'project' as project from public.work_source_rows
      where source='content_urls_sheet' and nullif(normalized_payload->>'project','') is not null`),
    query<any>(`select project,normalized_domain,count(*)::int as url_count,min(url) as sample_url from public.content_urls
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
        sampleUrl: row.sample_url,
      }));
    return {
      project: name,
      current,
      approvedGscProperty: approvedMap[name] ?? null,
      detectedDomains,
      canonicalDomain: current?.canonical_domain ??
        (detectedDomains.length === 1 ? detectedDomains[0]?.domain : null),
      domainConflict: detectedDomains.length > 1,
    };
  });
}

export async function listUnifiedProjectSettings() {
  const projects =
    await query<any>(`select p.id::text,p.canonical_name,p.canonical_domain,p.lifecycle,p.gsc_property,p.gsc_ready,p.kpi_ready,
    p.gsc_access_status,p.gsc_permission_level,p.gsc_verified_at,p.gsc_verified_by,p.gsc_verification_id,p.include_subdomains,
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
  if (!option) throw new Error("Không tìm thấy lựa chọn cấu hình dự án.");
  return {
    project:
      settings.projects.find(
        (row: any) => row.canonical_name === projectName,
      ) ?? null,
    option,
  };
}

export async function getProjectDomainRules() {
  const result = await query<any>(
    `select canonical_name,canonical_domain,include_subdomains,gsc_ready
     from public.projects where is_active=true and canonical_domain is not null`,
  );
  return Object.fromEntries(
    result.rows.map((row) => [
      row.canonical_name,
      {
        canonicalDomain: row.canonical_domain,
        includeSubdomains: Boolean(row.include_subdomains),
        gscReady: Boolean(row.gsc_ready),
      },
    ]),
  );
}

export async function recordProjectGscVerification(input: {
  projectName: string;
  gscProperty: string;
  permissionLevel: string | null;
  accessStatus: string;
  domainScopeStatus: string;
  testQueryStatus: string;
  includeSubdomains: boolean;
  actor: string;
  errorCode?: string | null;
  diagnostics?: Record<string, unknown>;
}) {
  const selected = (await listProjectOptions()).find(
    (option) => option.project === input.projectName.trim(),
  );
  if (!selected)
    throw new Error("Dự án phải được chọn từ danh sách đã đồng bộ.");
  return transaction(async (client) => {
    const project = await client.query(
      `insert into public.projects(canonical_name,created_at,updated_at)
       values($1,now(),now()) on conflict(canonical_name) do update set updated_at=now() returning id::text`,
      [input.projectName.trim()],
    );
    const passed =
      input.accessStatus === "verified" &&
      input.domainScopeStatus === "covered" &&
      input.testQueryStatus === "succeeded";
    const verification = await client.query(
      `insert into public.project_gsc_verifications
       (project_id,gsc_property,permission_level,access_status,domain_scope_status,test_query_status,include_subdomains,
        verified_by,verified_at,expires_at,error_code,diagnostics,created_at,updated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,case when $9 then now() else null end,
        case when $9 then now()+interval '30 days' else null end,$10,$11::jsonb,now(),now()) returning *`,
      [
        project.rows[0].id,
        input.gscProperty,
        input.permissionLevel,
        input.accessStatus,
        input.domainScopeStatus,
        input.testQueryStatus,
        input.includeSubdomains,
        input.actor,
        passed,
        input.errorCode ?? null,
        JSON.stringify(input.diagnostics ?? {}),
      ],
    );
    if (passed)
      await client.query(
        `update public.projects set gsc_access_status='verified',gsc_permission_level=$2,gsc_verified_at=now(),
         gsc_verified_by=$3,gsc_verification_id=$4,include_subdomains=$5,updated_at=now() where id=$1`,
        [
          project.rows[0].id,
          input.permissionLevel,
          input.actor,
          verification.rows[0].id,
          input.includeSubdomains,
        ],
      );
    return verification.rows[0];
  });
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
  gscVerificationId?: string | number | null;
  includeSubdomains?: boolean;
  fallbackWindows?: string | number[];
  minimumShortWindowDays?: number;
  neutralScorePct?: number;
  confidenceHighFactor?: number;
  confidenceMediumFactor?: number;
  confidenceLowFactor?: number;
  unknownScorePct?: number;
  observedZeroPolicy?: {
    under14DaysPct: number;
    days14To27Pct: number;
    days28PlusPct: number;
  };
  maxProvisionalPayablePct?: number;
  pmReviewThresholdPct?: number;
  minEligibleEvents?: number;
  minKnownCoveragePct?: number;
  minPostImpressions?: number;
  renormalizeMissing?: boolean;
  deduplicateEffectiveHorizon?: boolean;
}) {
  const options = await listProjectOptions();
  const selected = options.find(
    (option) => option.project === raw.projectName?.trim(),
  );
  if (!selected)
    throw new Error(
      "Dự án phải được chọn từ danh sách đã đồng bộ hoặc đã cấu hình.",
    );
  const allowedDomains = selected.detectedDomains.map((row) => row.domain);
  const canonicalDomain = (
    raw.canonicalDomain?.trim() ||
    selected.canonicalDomain ||
    ""
  ).toLowerCase();
  if (!canonicalDomain)
    throw new Error(
      "Không thể xác định tên miền chuẩn từ URL đã đồng bộ hoặc cấu hình đã duyệt.",
    );
  if (allowedDomains.length && !allowedDomains.includes(canonicalDomain))
    throw new Error(
      "Tên miền chuẩn phải thuộc danh sách tên miền hệ thống đã phát hiện.",
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
      "Phải nhập lý do kiểm toán khi thay đổi thuộc tính GSC đã duyệt.",
    );
  const gscProperty = raw.gscProperty?.trim() || approvedGsc || null;
  const verification = raw.gscVerificationId
    ? await query<any>(
        `select v.* from public.project_gsc_verifications v join public.projects p on p.id=v.project_id
         where v.id=$1 and p.canonical_name=$2 and v.gsc_property=$3 and v.access_status='verified'
           and v.domain_scope_status='covered' and v.test_query_status='succeeded'
           and v.verified_at is not null and v.expires_at>now() limit 1`,
        [raw.gscVerificationId, raw.projectName.trim(), gscProperty],
      )
    : { rows: [] as any[] };
  const validVerification = verification.rows[0] ?? null;
  const gscReady = Boolean(validVerification);
  const kpiReady = Boolean(canonicalDomain);
  const defaults = raw.lifecycle === "new_project"
    ? { minEvents: 1, coverage: 60, impressions: 0 }
    : raw.lifecycle === "stable_project"
      ? { minEvents: 2, coverage: 80, impressions: 300 }
      : { minEvents: 2, coverage: 70, impressions: 100 };
  const fallbackWindows = (Array.isArray(raw.fallbackWindows)
    ? raw.fallbackWindows
    : String(raw.fallbackWindows ?? "28,14,7").split(","))
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
  if (!fallbackWindows.length) throw new Error("Cửa sổ fallback phải chứa số ngày nguyên dương.");
  const rule = {
    fallbackWindows,
    minimumShortWindowDays: Number(raw.minimumShortWindowDays ?? 7),
    neutralScorePct: Number(raw.neutralScorePct ?? 70),
    confidenceHighFactor: Number(raw.confidenceHighFactor ?? 1),
    confidenceMediumFactor: Number(raw.confidenceMediumFactor ?? 0.7),
    confidenceLowFactor: Number(raw.confidenceLowFactor ?? 0.35),
    unknownScorePct: Number(raw.unknownScorePct ?? 70),
    observedZeroPolicy: {
      under_14_days: Number(raw.observedZeroPolicy?.under14DaysPct ?? 70),
      days_14_to_27: Number(raw.observedZeroPolicy?.days14To27Pct ?? 55),
      days_28_plus: Number(raw.observedZeroPolicy?.days28PlusPct ?? 40),
    },
    maxProvisionalPayablePct: Number(raw.maxProvisionalPayablePct ?? 70),
    pmReviewThresholdPct: Number(raw.pmReviewThresholdPct ?? 55),
    minEligibleEvents: Number(raw.minEligibleEvents ?? defaults.minEvents),
    minKnownCoveragePct: Number(raw.minKnownCoveragePct ?? defaults.coverage),
    minPostImpressions: Number(raw.minPostImpressions ?? defaults.impressions),
    renormalizeMissing: raw.renormalizeMissing !== false,
    deduplicateEffectiveHorizon: raw.deduplicateEffectiveHorizon !== false,
  };
  const percentFields = [
    rule.neutralScorePct,
    rule.unknownScorePct,
    rule.maxProvisionalPayablePct,
    rule.pmReviewThresholdPct,
    rule.minKnownCoveragePct,
    ...Object.values(rule.observedZeroPolicy),
  ];
  const factorFields = [rule.confidenceHighFactor, rule.confidenceMediumFactor, rule.confidenceLowFactor];
  if (percentFields.some((value) => !Number.isFinite(value) || value < 0 || value > 100))
    throw new Error("Ngưỡng điểm Performance và độ phủ phải nằm trong khoảng 0 đến 100.");
  if (factorFields.some((value) => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error("Hệ số tin cậy phải nằm trong khoảng 0 đến 1.");
  if (!Number.isInteger(rule.minimumShortWindowDays) || rule.minimumShortWindowDays < 1 || !Number.isInteger(rule.minEligibleEvents) || rule.minEligibleEvents < 1 || !Number.isInteger(rule.minPostImpressions) || rule.minPostImpressions < 0)
    throw new Error("Các giá trị tối thiểu của Performance không hợp lệ.");
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
         rule,
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
    gscVerificationId: validVerification?.id ?? null,
    includeSubdomains: Boolean(raw.includeSubdomains),
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
        "Phải nhập lý do kiểm toán khi thay đổi phiên bản Cài đặt dự án đã duyệt.",
      );
    const project = await client.query(
      `insert into public.projects(canonical_name,created_at,updated_at)
      values($1,now(),now()) on conflict(canonical_name) do update set updated_at=now() returning id::text`,
      [input.projectName],
    );
    const projectId = project.rows[0].id;
    const settings = await client.query(
      `insert into public.project_settings_versions
      (project_id,version,effective_from,status,lifecycle,canonical_domain,gsc_property,gsc_ready,kpi_ready,gsc_verification_id,include_subdomains,
       performance_weight_3m_pct,performance_weight_6m_pct,performance_weight_all_time_pct,settings_payload,reason,
       created_by,approved_by,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,now(),now())
      on conflict(project_id,version) do update set effective_from=excluded.effective_from,status=excluded.status,
       lifecycle=excluded.lifecycle,canonical_domain=excluded.canonical_domain,gsc_property=excluded.gsc_property,
       gsc_ready=excluded.gsc_ready,kpi_ready=excluded.kpi_ready,gsc_verification_id=excluded.gsc_verification_id,
       include_subdomains=excluded.include_subdomains,performance_weight_3m_pct=excluded.performance_weight_3m_pct,
       performance_weight_6m_pct=excluded.performance_weight_6m_pct,performance_weight_all_time_pct=excluded.performance_weight_all_time_pct,
        settings_payload=excluded.settings_payload,reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now()
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
        validVerification?.id ?? null,
        Boolean(raw.includeSubdomains),
        input.weights.threeMonth,
        input.weights.sixMonth,
        input.weights.allTime,
        JSON.stringify({
          measurementStrategy: lifecycleMeasurementStrategy(input.lifecycle),
          fallbackWindows: rule.fallbackWindows,
          neutralScorePct: rule.neutralScorePct,
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
        `update public.projects set canonical_domain=$2,lifecycle=$3,gsc_property=$4,gsc_ready=$5,kpi_ready=$6,
         gsc_access_status=$7,gsc_permission_level=$8,gsc_verified_at=$9,gsc_verified_by=$10,gsc_verification_id=$11,
         include_subdomains=$12,updated_at=now() where id=$1`,
        [
          projectId,
          input.canonicalDomain,
          input.lifecycle,
          input.gscProperty,
          input.gscReady,
          input.kpiReady,
          input.gscReady ? "verified" : "unverified",
          validVerification?.permission_level ?? null,
          validVerification?.verified_at ?? null,
          validVerification?.verified_by ?? null,
          validVerification?.id ?? null,
          Boolean(raw.includeSubdomains),
        ],
      );
      await client.query(
        `update public.content_urls set gsc_property=$2,gsc_ready=$3,updated_at=now() where project_id=$1`,
        [projectId, input.gscProperty, input.gscReady],
      );
      await client.query(
        `update public.url_work_events e set
         content_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active'),
         kpi_ready=(e.is_countable and coalesce(e.unified_source_state,'active')='active'),
         performance_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active' and $2),
         performance_readiness_state=case when $2 then 'fallback' else 'pm_review' end,
         performance_readiness_issues=case when $2 then '[]'::jsonb else '["gsc_property_unverified"]'::jsonb end,
         readiness_issues=coalesce(e.readiness_issues,'[]'::jsonb)-'project_not_kpi_ready',updated_at=now()
         where project_id=$1`,
        [projectId, input.gscReady],
      );
      await client.query(
        `insert into public.project_kpi_settings(project,measurement_strategy,performance_enabled_for_payroll,created_at,updated_at)
        values($1,$2,$3,now(),now()) on conflict(project) do update set measurement_strategy=excluded.measurement_strategy,
        performance_enabled_for_payroll=excluded.performance_enabled_for_payroll,updated_at=now()`,
        [
          input.projectName,
          lifecycleMeasurementStrategy(input.lifecycle),
          true,
        ],
      );
      await client.query(
        `insert into public.project_performance_rule_versions
         (project_id,version,lifecycle,effective_from,status,fallback_window_days,minimum_short_window_days,
          neutral_score_pct,confidence_high_factor,confidence_medium_factor,confidence_low_factor,unknown_score_pct,
          observed_zero_policy,max_provisional_payable_pct,pm_review_threshold_pct,min_eligible_events,
          min_known_coverage_pct,min_post_impressions,range_fallback_policy,reason,created_by,approved_by,approved_at,created_at,updated_at)
         values($1,$2,$3,$4,'approved',$5::integer[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$20,now(),now(),now())
         on conflict(project_id,version) do update set lifecycle=excluded.lifecycle,effective_from=excluded.effective_from,
          status='approved',fallback_window_days=excluded.fallback_window_days,minimum_short_window_days=excluded.minimum_short_window_days,
          neutral_score_pct=excluded.neutral_score_pct,confidence_high_factor=excluded.confidence_high_factor,
          confidence_medium_factor=excluded.confidence_medium_factor,confidence_low_factor=excluded.confidence_low_factor,
          unknown_score_pct=excluded.unknown_score_pct,observed_zero_policy=excluded.observed_zero_policy,
          max_provisional_payable_pct=excluded.max_provisional_payable_pct,pm_review_threshold_pct=excluded.pm_review_threshold_pct,
          min_eligible_events=excluded.min_eligible_events,min_known_coverage_pct=excluded.min_known_coverage_pct,
          min_post_impressions=excluded.min_post_impressions,range_fallback_policy=excluded.range_fallback_policy,
          reason=excluded.reason,approved_by=excluded.approved_by,
          approved_at=now(),updated_at=now()`,
        [projectId,input.version,input.lifecycle,input.effectiveFrom,rule.fallbackWindows,rule.minimumShortWindowDays,
         rule.neutralScorePct,rule.confidenceHighFactor,rule.confidenceMediumFactor,rule.confidenceLowFactor,
         rule.unknownScorePct,JSON.stringify(rule.observedZeroPolicy),rule.maxProvisionalPayablePct,rule.pmReviewThresholdPct,
         rule.minEligibleEvents,rule.minKnownCoveragePct,rule.minPostImpressions,
         JSON.stringify({renormalize_missing:rule.renormalizeMissing,deduplicate_effective_horizon:rule.deduplicateEffectiveHorizon}),input.reason,raw.actor],
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
