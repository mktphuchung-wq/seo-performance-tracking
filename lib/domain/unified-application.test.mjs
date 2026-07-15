import assert from "node:assert/strict";
import { readFile,access } from "node:fs/promises";
import test from "node:test";
import { normalizeDomain,validateContributionWeights,validateRangeWeights } from "./project-settings.ts";
import { aggregatePerformanceRange,combineAvailableScores } from "../performance/range-calculator.ts";
import { calculateFinalMonthlyKpi } from "../kpi/monthly-final.ts";
import { scoreBase } from "../kpi/types.ts";
import { reconcileWorkSourceRows } from "./work-source.ts";

test("Project Settings normalizes domains and requires complete range weights",()=>{
  assert.equal(normalizeDomain("https://WWW.Example.com/path"),"example.com");
  assert.deepEqual(validateRangeWeights({threeMonth:70,sixMonth:30,allTime:0}),{threeMonth:70,sixMonth:30,allTime:0});
  assert.throws(()=>validateRangeWeights({threeMonth:70,sixMonth:20,allTime:0}),/total 100/);
});

test("member project contribution weights must be explicit and total 100",()=>{
  assert.equal(validateContributionWeights([{projectName:"A",weightPct:60},{projectName:"B",weightPct:40}]).length,2);
  assert.throws(()=>validateContributionWeights([{projectName:"A",weightPct:50}]),/total 100/);
});

const month=(overrides={})=>({monthKey:"2026-07-01",projectId:"p",project:"Project",memberId:"m",memberName:"Member",targetUnits:10,rawPct:80,payablePct:80,coveragePct:100,confidence:"high",status:"scored",sourceIds:["event-1"],subScores:{impressionPerformance:80,clickPerformance:70,growthCoverage:90,portfolioHealth:75},ruleVersion:"v1",dataAsOf:"2026-07-28",...overrides});
test("Performance Service range aggregation preserves coverage and N/A",()=>{
  const scored=aggregatePerformanceRange([month(),month({monthKey:"2026-06-01",targetUnits:10,payablePct:60})],"3m");
  assert.equal(scored.payablePct,70);assert.equal(scored.coveragePct,100);assert.equal(scored.status,"scored");
  const partial=aggregatePerformanceRange([month(),month({monthKey:"2026-06-01",payablePct:null,status:"insufficient_data"})],"3m");
  assert.equal(partial.coveragePct,50);assert.equal(partial.payablePct,80);assert.equal(partial.status,"insufficient_data");
});

test("system errors are never renormalized",()=>{
  assert.equal(combineAvailableScores([{key:"3m",score:80,weight:70,status:"scored"},{key:"6m",score:null,weight:30,status:"system_error"}]).status,"system_error");
});

test("Final KPI uses only three components and supports justified Social N/A",()=>{
  const scored=(pct)=>scoreBase({ruleVersion:"test",state:"scored",rawPct:pct,payablePct:pct,coveragePct:100});
  const result=calculateFinalMonthlyKpi({components:[
    {key:"seo_content",weightPct:60,required:true,score:scored(90)},
    {key:"seo_performance",weightPct:20,required:false,score:scored(80)},
    {key:"social_video",weightPct:20,required:true,allowsNa:true,score:scoreBase({ruleVersion:"test",state:"not_applicable",reason:"no_assignment"})},
  ]});
  assert.equal(result.payablePct,87.5);assert.equal(result.coveragePct,80);
});

test("unified migration is additive, versioned, and seeds no production weights",async()=>{
  const migration=await readFile(new URL("../../migrations/20260715_unified_application.sql",import.meta.url),"utf8");
  for(const table of ["project_settings_versions","member_project_contribution_weights","performance_range_results","kpi_templates","application_audit_log"])assert.match(migration,new RegExp(`create table if not exists public\\.${table}`,"i"));
  assert.match(migration,/performance_weight_3m_pct numeric\(5,2\)/i);
  assert.doesNotMatch(migration,/insert into public\.kpi_templates/i);
  assert.doesNotMatch(migration,/insert into public\.member_project_contribution_weights/i);
});

test("required Admin and Member route contracts exist",async()=>{
  for(const route of ["../../app/admin/sync/page.tsx","../../app/admin/projects/page.tsx","../../app/admin/data-source/page.tsx","../../app/admin/member-performance/page.tsx","../../app/admin/member-review/page.tsx","../../app/admin/kpi-close/page.tsx","../../app/dashboard/page.tsx","../../app/my-urls/page.tsx","../../app/my-kpi/page.tsx"])await access(new URL(route,import.meta.url));
});

test("115-row source fixture retains every row and quarantines 16 missing work types from KPI",()=>{
  const rows=Array.from({length:115},(_,index)=>({source:"slack_list_sheet",sourceRowNumber:index+2,sourceItemId:`fixture-${index+1}`,projectRaw:"Print Your Wear",memberRaw:"Fixture Member",workTypeRaw:index<16?"":"New Content",sourceStatusRaw:"Completed",urlRaw:`https://example.com/article-${index+1}`,workDateRaw:"2026-07-10"}));
  const result=reconcileWorkSourceRows(rows);
  assert.equal(result.diagnostics.rawRows,115);assert.equal(result.canonicalRows.length,115);assert.equal(result.canonicalRows.filter((row)=>row.issues.includes("work_type_unresolved")).length,16);assert.equal(result.diagnostics.canonicalCompletedEvents,99);
});
