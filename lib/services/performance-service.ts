import { query, transaction } from "../db";
import { refreshMonthlyPerformanceV2 } from "../performance/refresh-v2";
import {
  aggregatePerformanceRange,
  combineAvailableScores,
  type MonthlyPerformanceRow,
  type RangeKey,
} from "../performance/range-calculator";
import { rollupProjectsByEligibleWorkUnits } from "../kpi/work-unit-rollup";
export {
  aggregatePerformanceRange,
  combineAvailableScores,
} from "../performance/range-calculator";

const rangeKeys: RangeKey[] = ["3m", "6m", "all_time"];
const asMonth = (value: string) =>
  /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);
const shiftMonth = (month: string, delta: number) => {
  const date = new Date(`${asMonth(month)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
};
const rangeStart = (month: string, range: RangeKey) =>
  range === "3m"
    ? shiftMonth(month, -2)
    : range === "6m"
      ? shiftMonth(month, -5)
      : "2000-01-01";

async function loadMonthlyRows(
  asOfMonth: string,
): Promise<MonthlyPerformanceRow[]> {
  const result = await query<any>(
    `with work as (
    select date_trunc('month',e.work_date)::date as month_key,e.project,e.member_name,e.project_id,e.member_id,
      sum(e.unit_value)::numeric as work_units
    from public.url_work_events e where e.performance_kpi_eligible=true and e.is_countable=true
      and coalesce(e.unified_source_state,'active')='active'
      and e.work_date<date_trunc('month',$1::date)+interval '1 month'
    group by 1,2,3,4,5
  ) select w.month_key::text,w.project,w.member_name,w.work_units,w.project_id::text,w.member_id::text,
    r.raw_pct,r.payable_pct,r.coverage_pct,r.confidence,r.status,
    coalesce(r.diagnostics->'eventIds','[]'::jsonb) as source_ids,r.sub_scores,r.rule_version,r.data_as_of::text
    from work w left join public.performance_project_member_month_results r
      on r.month_key=w.month_key and r.project=w.project and r.member_name=w.member_name
    order by w.month_key,w.member_name,w.project`,
    [asMonth(asOfMonth)],
  );
  return result.rows.map((row) => ({
    monthKey: String(row.month_key).slice(0, 10),
    projectId: row.project_id,
    project: row.project,
    memberId: row.member_id,
    memberName: row.member_name,
    workUnits: Number(row.work_units ?? 0),
    rawPct: row.raw_pct === null ? null : Number(row.raw_pct),
    payablePct: row.payable_pct === null ? null : Number(row.payable_pct),
    coveragePct: row.coverage_pct === null ? null : Number(row.coverage_pct),
    confidence: row.confidence ?? "unknown",
    status: row.status ?? null,
    sourceIds: Array.isArray(row.source_ids) ? row.source_ids : [],
    subScores: row.sub_scores ?? {},
    ruleVersion: row.rule_version ?? null,
    dataAsOf: row.data_as_of ?? null,
  }));
}

export async function rebuildPerformanceRanges(asOfMonthInput: string) {
  const asOfMonth = asMonth(asOfMonthInput);
  const rows = await loadMonthlyRows(asOfMonth);
  const keys = [
    ...new Set(rows.map((row) => `${row.projectId}|${row.memberId}`)),
  ];
  return transaction(async (client) => {
    let persisted = 0;
    for (const key of keys) {
      const [projectId, memberId] = key.split("|");
      const identity = rows.find(
        (row) => row.projectId === projectId && row.memberId === memberId,
      )!;
      for (const rangeKey of rangeKeys) {
        const start = rangeStart(asOfMonth, rangeKey);
        const selected = rows.filter(
          (row) =>
            row.projectId === projectId &&
            row.memberId === memberId &&
            row.monthKey >= start &&
            row.monthKey <= asOfMonth,
        );
        const result = aggregatePerformanceRange(selected, rangeKey);
        await client.query(
          `insert into public.performance_range_results
          (as_of_month,project_id,member_id,range_key,impression_performance_pct,click_performance_pct,growth_coverage_pct,
           portfolio_health_pct,raw_pct,payable_pct,coverage_pct,confidence,status,source_cohort,source_ids,diagnostics,
           effective_horizon,rule_version,data_as_of,calculated_at,created_at,updated_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,'performance_service_v2',$18,now(),now(),now())
          on conflict(as_of_month,project_id,member_id,range_key,rule_version) do update set
           impression_performance_pct=excluded.impression_performance_pct,click_performance_pct=excluded.click_performance_pct,
           growth_coverage_pct=excluded.growth_coverage_pct,portfolio_health_pct=excluded.portfolio_health_pct,
           raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,coverage_pct=excluded.coverage_pct,
           confidence=excluded.confidence,status=excluded.status,source_cohort=excluded.source_cohort,source_ids=excluded.source_ids,
           diagnostics=excluded.diagnostics,effective_horizon=excluded.effective_horizon,data_as_of=excluded.data_as_of,calculated_at=now(),updated_at=now()`,
          [
            asOfMonth,
            projectId,
            memberId,
            rangeKey,
            result.subScores.impressionPerformance,
            result.subScores.clickPerformance,
            result.subScores.growthCoverage,
            result.subScores.portfolioHealth,
            result.rawPct,
            result.payablePct,
            result.coveragePct,
            result.confidence,
            result.status,
            `${identity.project}:${identity.memberName}:${rangeKey}`,
            JSON.stringify(result.sourceIds),
            JSON.stringify({ ...result.diagnostics, reason: result.reason }),
            result.effectiveHorizon,
            result.dataAsOf,
          ],
        );
        persisted += 1;
      }
    }
    return { asOfMonth, assignments: keys.length, rangeResults: persisted };
  });
}

export async function getPerformanceWorkspace(input: {
  asOfMonth: string;
  memberName?: string;
}) {
  const month = asMonth(input.asOfMonth);
  const params: any[] = [month];
  let memberFilter = "";
  if (input.memberName) {
    params.push(input.memberName);
    memberFilter = " and m.canonical_name=$2";
  }
  const [ranges, settings, workUnits] = await Promise.all([
    query<any>(
      `select r.*,p.canonical_name as project,m.canonical_name as member_name from public.performance_range_results r
      join public.projects p on p.id=r.project_id join public.members m on m.id=r.member_id
      where r.as_of_month=$1${memberFilter} order by m.canonical_name,p.canonical_name,r.range_key`,
      params,
    ),
    query<any>(
      `select p.id::text,p.canonical_name,s.performance_weight_3m_pct,s.performance_weight_6m_pct,
      s.performance_weight_all_time_pct,s.lifecycle,s.version from public.projects p left join lateral(
      select * from public.project_settings_versions v where v.project_id=p.id and v.status='approved' and v.effective_from<=$1
      and(v.effective_to is null or v.effective_to>=$1) order by v.effective_from desc,v.id desc limit 1)s on true`,
      [month],
    ),
    query<any>(
      `select e.member_name,e.project,sum(e.unit_value)::numeric as work_units
      from public.url_work_events e join public.members m on m.id=e.member_id
      where e.performance_kpi_eligible=true and e.is_countable=true and coalesce(e.unified_source_state,'active')='active'
        and e.work_date<date_trunc('month',$1::date)+interval '1 month'${memberFilter}
      group by e.member_name,e.project order by e.member_name,e.project`,
      params,
    ),
  ]);
  const projectRows = ranges.rows;
  const members = [...new Set(projectRows.map((row: any) => row.member_name))];
  const summaries = members.map((memberName) => {
    const memberRanges = projectRows.filter(
      (row: any) => row.member_name === memberName,
    );
    const projects = [
      ...new Set(memberRanges.map((row: any) => row.project)),
    ].map((project) => {
      const projectRanges = memberRanges.filter(
        (row: any) => row.project === project,
      );
      const setting = settings.rows.find(
        (row: any) => row.canonical_name === project,
      );
      const result = combineAvailableScores(
        ["3m", "6m", "all_time"].map((key) => {
          const row = projectRanges.find((item: any) => item.range_key === key);
          const weight = Number(
            key === "3m"
              ? setting?.performance_weight_3m_pct
              : key === "6m"
                ? setting?.performance_weight_6m_pct
                : setting?.performance_weight_all_time_pct,
          );
          return {
            key,
            score:
              row?.status === "scored" &&
              row.payable_pct !== null &&
              row.payable_pct !== undefined
                ? Number(row.payable_pct)
                : null,
            weight: Number.isFinite(weight) ? weight : 0,
            status: row?.status ?? "insufficient_data",
            effectiveHorizon: row?.effective_horizon ?? null,
          };
        }),
      );
      return {
        project,
        ranges: projectRanges,
        result,
        settingsVersion: setting?.version ?? null,
        lifecycle: setting?.lifecycle ?? null,
      };
    });
    const memberResult = rollupProjectsByEligibleWorkUnits(
      projects.map((project) => {
        const units = workUnits.rows.find(
          (row: any) =>
            row.member_name === memberName && row.project === project.project,
        );
        return {
          project: project.project,
          score: project.result.score,
          workUnits: Number(units?.work_units ?? 0),
          status: project.result.status,
          reason: project.result.reason,
        };
      }),
    );
    return {
      memberName,
      projects: projects.map((project) => ({
        ...project,
        workUnits: Number(
          workUnits.rows.find(
            (row: any) =>
              row.member_name === memberName && row.project === project.project,
          )?.work_units ?? 0,
        ),
      })),
      memberResult,
    };
  });
  return { asOfMonth: month.slice(0, 7), summaries };
}

export async function refreshPerformanceService(input: {
  month: string;
  accessToken: string;
  now?: Date;
}) {
  const monthly = await refreshMonthlyPerformanceV2(input);
  const ranges = await rebuildPerformanceRanges(input.month);
  return { service: "performance_service_v1", monthly, ranges };
}
