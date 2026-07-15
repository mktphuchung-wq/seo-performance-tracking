import { query } from "../db";
import { fetchTrackedGscDaily, type GscDailyFetchRow } from "../google";
import { calculatePerformance, type MeasurementStrategy } from "../kpi/performance.ts";
import { scoreBase } from "../kpi/types.ts";
import { completeDataCutoff } from "./gsc-daily.ts";
import { selectEventCohort, type PerformanceWorkEvent } from "./cohort-selector.ts";
import type { EventPerformanceMetric, PerformanceThresholds } from "./strategies/common.ts";
import { persistGscFetchRun } from "../repositories/gsc-metrics";
import { persistPerformanceResult } from "../repositories/performance-results.ts";

const monthKey=(value:string)=>/^\d{4}-\d{2}$/.test(value)?`${value}-01`:value;
const monthEnd=(value:string)=>{const date=new Date(`${monthKey(value)}T00:00:00.000Z`);date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);};

function aggregateWindow(rows:GscDailyFetchRow[],start:string,end:string){const windowRows=rows.filter((row)=>row.date>=start&&row.date<=end);const known=windowRows.filter((row)=>row.status!=="unknown");return{clicks:known.reduce((sum,row)=>sum+(row.clicks??0),0),impressions:known.reduce((sum,row)=>sum+(row.impressions??0),0),coveragePct:windowRows.length?known.length/windowRows.length*100:0,status:known.length===0?"unknown":known.every((row)=>(row.clicks??0)===0&&(row.impressions??0)===0)?"observed_zero":"observed"};}

export async function refreshMonthlyPerformanceV2(input:{month:string;accessToken:string;now?:Date}){
  const month=monthKey(input.month);const cutoff=completeDataCutoff(monthEnd(month),input.now??new Date());
  const assignments=await query<any>(`select t.project,t.member_name,t.target_units,s.measurement_strategy,
    coalesce(s.performance_enabled_for_payroll,false) as performance_enabled_for_payroll,coalesce(s.pre_window_days,28) as pre_window_days,
    coalesce(s.post_window_days,28) as post_window_days,coalesce(s.seo_lag_days,28) as seo_lag_days,
    coalesce(s.min_eligible_events,5) as min_eligible_events,coalesce(s.min_data_coverage_pct,80) as min_data_coverage_pct,
    coalesce(s.min_total_impressions,500) as min_total_impressions,coalesce(s.zero_signal_score_pct,0) as zero_signal_score_pct,
    coalesce(s.new_signal_score_pct,60) as new_signal_score_pct,coalesce(s.seasonality_mode,'pm_review') as seasonality_mode,
    coalesce(s.performance_rule_version,'performance_v2') as performance_rule_version,s.project_start_date
    from public.monthly_member_kpi_targets t left join public.project_kpi_settings s on s.project=t.project where t.month_key=$1
    order by t.member_name,t.project`,[month]);
  const output=[];
  for(const assignment of assignments.rows){
    const strategy=(assignment.measurement_strategy??"growth_project") as MeasurementStrategy;
    const eventsResult=await query<any>(`select e.id::text,e.content_url_id::text,e.canonical_url_snapshot,e.project,e.member_name,e.work_type,
      e.work_date::text,e.unit_value,e.status,e.is_countable,c.gsc_property,
      (select min(later.work_date)::text from public.url_work_events later where later.content_url_id=e.content_url_id and later.work_date>e.work_date) as next_work_date
      from public.url_work_events e join public.content_urls c on c.id=e.content_url_id where e.project=$1 and e.member_name=$2 and e.kpi_ready=true and c.gsc_ready=true
      and e.work_date>=date_trunc('month',$3::date) and e.work_date<date_trunc('month',$3::date)+interval '1 month'`,[assignment.project,assignment.member_name,month]);
    const events:PerformanceWorkEvent[]=eventsResult.rows.map((row)=>({id:row.id,contentUrlId:row.content_url_id,canonicalUrl:row.canonical_url_snapshot,project:row.project,memberName:row.member_name,workType:row.work_type,workDate:row.work_date,unitValue:Number(row.unit_value),status:row.status,isCountable:Boolean(row.is_countable),nextWorkDate:row.next_work_date}));
    const selected=selectEventCohort({events,project:assignment.project,memberName:assignment.member_name,dataCutoff:cutoff,eligibleWorkTypes:strategy==="stable_audit"?["audit","update"]:["new_content","audit","update"],preWindowDays:Number(assignment.pre_window_days),postWindowDays:Number(assignment.post_window_days),seoLagDays:Number(assignment.seo_lag_days),seasonalityMode:assignment.seasonality_mode});
    const thresholds:PerformanceThresholds={minEligibleEvents:Number(assignment.min_eligible_events),minDataCoveragePct:Number(assignment.min_data_coverage_pct),minTotalImpressions:Number(assignment.min_total_impressions),zeroSignalScorePct:Number(assignment.zero_signal_score_pct),newSignalScorePct:Number(assignment.new_signal_score_pct)};
    let metrics:EventPerformanceMetric[]=[];let fetched:GscDailyFetchRow[]=[];
    const fetchable=selected.filter((event)=>event.exclusionReason!=="post_window_incomplete");
    if(strategy!=="new_project"&&fetchable.length){const start=fetchable.reduce((min,event)=>event.preStartDate<min?event.preStartDate:min,fetchable[0].preStartDate);const end=fetchable.reduce((max,event)=>event.postEndDate>max?event.postEndDate:max,fetchable[0].postEndDate);fetched=await fetchTrackedGscDaily(fetchable.map((event)=>{const source=eventsResult.rows.find((row)=>row.id===event.id);return{project:event.project,gscProperty:source?.gsc_property??null,canonicalUrl:event.canonicalUrl};}),input.accessToken,{startDate:start,endDate:end,label:`${assignment.project} ${assignment.member_name} event windows`});await persistGscFetchRun({runKey:`kpi-v2:${month}:${assignment.project}:${assignment.member_name}`,dataCutoff:cutoff,rows:fetched});metrics=fetchable.map((event)=>{const urlRows=fetched.filter((row)=>row.canonicalUrl===event.canonicalUrl);const pre=aggregateWindow(urlRows,event.preStartDate,event.preEndDate);const post=aggregateWindow(urlRows,event.postStartDate,event.postEndDate);return{eventId:event.id,unitValue:event.unitValue,status:post.status,comparisonObserved:pre.coveragePct>=thresholds.minDataCoveragePct&&post.coveragePct>=thresholds.minDataCoveragePct,preClicks:pre.clicks,postClicks:post.clicks,preImpressions:pre.impressions,postImpressions:post.impressions,controlGrowthPct:null,contaminated:event.contaminated,comparable:event.exclusionReason!=='seasonality_pm_review'} as EventPerformanceMetric;});}
    let score=calculatePerformance({strategy,metrics,thresholds,project:assignment.project,memberName:assignment.member_name,month:month.slice(0,7),dataAsOf:cutoff,readiness:{projectAgeDays:assignment.project_start_date?Math.max(0,Math.floor((new Date(`${cutoff}T00:00:00Z`).getTime()-new Date(assignment.project_start_date).getTime())/86400000)):0,matureEligibleUrls:fetchable.length,coveragePct:metrics.length?metrics.filter((metric)=>metric.status!=="unknown").length/metrics.length*100:0,completeComparableWindows:metrics.filter((metric)=>metric.comparisonObserved).length,totalImpressions:metrics.reduce((sum,metric)=>sum+metric.postImpressions,0),adminPromoted:Boolean(assignment.performance_enabled_for_payroll),dataAsOf:cutoff},seasonalComparabilityLow:selected.some((event)=>event.exclusionReason==='seasonality_pm_review')});
    if(!assignment.performance_enabled_for_payroll&&strategy!=="new_project")score=scoreBase({...score,state:"not_applicable",payablePct:null,reason:"performance_not_enabled_for_payroll",diagnostics:{...score.diagnostics,diagnosticRawPct:score.rawPct}});
    const persisted=await persistPerformanceResult({month,project:assignment.project,memberName:assignment.member_name,strategy,cohortKey:`${strategy}:${month.slice(0,7)}`,eventIds:selected.map((event)=>event.id),ruleVersion:assignment.performance_rule_version,lineage:{selectedEvents:selected,cutoff,fetchRows:fetched.length},metrics,score});output.push(persisted);
  }
  return{month,dataCutoff:cutoff,assignments:assignments.rows.length,results:output};
}
