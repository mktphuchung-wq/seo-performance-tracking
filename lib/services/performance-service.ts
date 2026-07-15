import { query, transaction } from "../db";
import { refreshMonthlyPerformanceV2 } from "../performance/refresh-v2";
import { aggregatePerformanceRange,combineAvailableScores,type MonthlyPerformanceRow,type RangeKey } from "../performance/range-calculator";
export { aggregatePerformanceRange,combineAvailableScores } from "../performance/range-calculator";

const rangeKeys: RangeKey[] = ["3m","6m","all_time"];
const asMonth = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0,10);
const shiftMonth = (month: string, delta: number) => { const date=new Date(`${asMonth(month)}T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth()+delta); return date.toISOString().slice(0,10); };
const rangeStart = (month: string, range: RangeKey) => range === "3m" ? shiftMonth(month,-2) : range === "6m" ? shiftMonth(month,-5) : "2000-01-01";


async function loadMonthlyRows(asOfMonth: string): Promise<MonthlyPerformanceRow[]> {
  const result=await query<any>(`select t.month_key::text,t.project,t.member_name,t.target_units,p.id::text as project_id,m.id::text as member_id,
    r.raw_pct,r.payable_pct,r.coverage_pct,r.confidence,r.status,r.source_ids,r.sub_scores,r.rule_version,r.data_as_of::text
    from public.monthly_member_kpi_targets t
    join public.projects p on p.canonical_name=t.project join public.members m on m.canonical_name=t.member_name
    left join public.performance_project_member_month_results r on r.month_key=t.month_key and r.project=t.project and r.member_name=t.member_name
    where t.month_key<date_trunc('month',$1::date)+interval '1 month' order by t.month_key,t.member_name,t.project`,[asMonth(asOfMonth)]);
  return result.rows.map((row)=>({monthKey:String(row.month_key).slice(0,10),projectId:row.project_id,project:row.project,memberId:row.member_id,
    memberName:row.member_name,targetUnits:Number(row.target_units??0),rawPct:row.raw_pct===null?null:Number(row.raw_pct),
    payablePct:row.payable_pct===null?null:Number(row.payable_pct),coveragePct:row.coverage_pct===null?null:Number(row.coverage_pct),
    confidence:row.confidence??"unknown",status:row.status??null,sourceIds:Array.isArray(row.source_ids)?row.source_ids:[],subScores:row.sub_scores??{},
    ruleVersion:row.rule_version??null,dataAsOf:row.data_as_of??null}));
}

export async function rebuildPerformanceRanges(asOfMonthInput:string) {
  const asOfMonth=asMonth(asOfMonthInput);
  const rows=await loadMonthlyRows(asOfMonth);
  const keys=[...new Set(rows.map((row)=>`${row.projectId}|${row.memberId}`))];
  return transaction(async(client)=>{
    let persisted=0;
    for(const key of keys){
      const [projectId,memberId]=key.split("|");
      const identity=rows.find((row)=>row.projectId===projectId&&row.memberId===memberId)!;
      for(const rangeKey of rangeKeys){
        const start=rangeStart(asOfMonth,rangeKey);
        const selected=rows.filter((row)=>row.projectId===projectId&&row.memberId===memberId&&row.monthKey>=start&&row.monthKey<=asOfMonth);
        const result=aggregatePerformanceRange(selected,rangeKey);
        await client.query(`insert into public.performance_range_results
          (as_of_month,project_id,member_id,range_key,impression_performance_pct,click_performance_pct,growth_coverage_pct,
           portfolio_health_pct,raw_pct,payable_pct,coverage_pct,confidence,status,source_cohort,source_ids,diagnostics,
           rule_version,data_as_of,calculated_at,created_at,updated_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,'performance_service_v1',$17,now(),now(),now())
          on conflict(as_of_month,project_id,member_id,range_key,rule_version) do update set
           impression_performance_pct=excluded.impression_performance_pct,click_performance_pct=excluded.click_performance_pct,
           growth_coverage_pct=excluded.growth_coverage_pct,portfolio_health_pct=excluded.portfolio_health_pct,
           raw_pct=excluded.raw_pct,payable_pct=excluded.payable_pct,coverage_pct=excluded.coverage_pct,
           confidence=excluded.confidence,status=excluded.status,source_cohort=excluded.source_cohort,source_ids=excluded.source_ids,
           diagnostics=excluded.diagnostics,data_as_of=excluded.data_as_of,calculated_at=now(),updated_at=now()`,[
          asOfMonth,projectId,memberId,rangeKey,result.subScores.impressionPerformance,result.subScores.clickPerformance,
          result.subScores.growthCoverage,result.subScores.portfolioHealth,result.rawPct,result.payablePct,result.coveragePct,
          result.confidence,result.status,`${identity.project}:${identity.memberName}:${rangeKey}`,JSON.stringify(result.sourceIds),
          JSON.stringify({...result.diagnostics,reason:result.reason}),result.dataAsOf]);
        persisted+=1;
      }
    }
    return {asOfMonth,assignments:keys.length,rangeResults:persisted};
  });
}

export async function getPerformanceWorkspace(input:{asOfMonth:string;memberName?:string}) {
  const month=asMonth(input.asOfMonth);const params:any[]=[month];let memberFilter="";
  if(input.memberName){params.push(input.memberName);memberFilter=" and m.canonical_name=$2";}
  const [ranges,settings,contributions]=await Promise.all([
    query<any>(`select r.*,p.canonical_name as project,m.canonical_name as member_name from public.performance_range_results r
      join public.projects p on p.id=r.project_id join public.members m on m.id=r.member_id
      where r.as_of_month=$1${memberFilter} order by m.canonical_name,p.canonical_name,r.range_key`,params),
    query<any>(`select p.id::text,p.canonical_name,s.performance_weight_3m_pct,s.performance_weight_6m_pct,
      s.performance_weight_all_time_pct,s.lifecycle,s.version from public.projects p left join lateral(
      select * from public.project_settings_versions v where v.project_id=p.id and v.status='approved' and v.effective_from<=$1
      and(v.effective_to is null or v.effective_to>=$1) order by v.effective_from desc,v.id desc limit 1)s on true`,[month]),
    query<any>(`with latest as (
      select distinct on (w.member_id) w.member_id,w.version
      from public.member_project_contribution_weights w
      join public.members lm on lm.id=w.member_id
      where w.month_key=$1${input.memberName ? " and lm.canonical_name=$2" : ""}
      order by w.member_id,w.approved_at desc nulls last,w.updated_at desc,w.version desc
    )
      select m.canonical_name as member_name,p.canonical_name as project,w.weight_pct,w.version
      from public.member_project_contribution_weights w
      join latest l on l.member_id=w.member_id and l.version=w.version
      join public.members m on m.id=w.member_id join public.projects p on p.id=w.project_id
      where w.month_key=$1${memberFilter} order by m.canonical_name,p.canonical_name`,params),
  ]);
  const projectRows=ranges.rows;const members=[...new Set(projectRows.map((row:any)=>row.member_name))];
  const summaries=members.map((memberName)=>{
    const memberRanges=projectRows.filter((row:any)=>row.member_name===memberName);
    const projects=[...new Set(memberRanges.map((row:any)=>row.project))].map((project)=>{
      const projectRanges=memberRanges.filter((row:any)=>row.project===project);
      const setting=settings.rows.find((row:any)=>row.canonical_name===project);
      const result=combineAvailableScores(["3m","6m","all_time"].map((key)=>{const row=projectRanges.find((item:any)=>item.range_key===key);const weight=Number(key==="3m"?setting?.performance_weight_3m_pct:key==="6m"?setting?.performance_weight_6m_pct:setting?.performance_weight_all_time_pct);return{key,score:row?.status==="scored"&&row.payable_pct!==null&&row.payable_pct!==undefined?Number(row.payable_pct):null,weight:Number.isFinite(weight)?weight:0,status:row?.status??"insufficient_data"};}));
      return{project,ranges:projectRanges,result,settingsVersion:setting?.version??null,lifecycle:setting?.lifecycle??null};
    });
    const weights=contributions.rows.filter((row:any)=>row.member_name===memberName);
    const memberResult=combineAvailableScores(projects.map((project)=>{const weight=weights.find((row:any)=>row.project===project.project);return{key:project.project,score:project.result.score,weight:Number(weight?.weight_pct??0),status:project.result.status};}));
    return{memberName,projects,memberResult,contributionVersion:weights[0]?.version??null};
  });
  return{asOfMonth:month.slice(0,7),summaries};
}

export async function refreshPerformanceService(input:{month:string;accessToken:string;now?:Date}) {
  const monthly=await refreshMonthlyPerformanceV2(input);
  const ranges=await rebuildPerformanceRanges(input.month);
  return{service:"performance_service_v1",monthly,ranges};
}
