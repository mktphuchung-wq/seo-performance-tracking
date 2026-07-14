import { readFile } from "node:fs/promises";
import { parseSlackListSheet } from "../lib/sync/slack-list-sheet.ts";
import { reconcileWorkSourceRows } from "../lib/domain/work-source.ts";
import { persistWorkSourceReconciliation } from "../lib/repositories/work-source-rows.ts";

const path=process.argv[2];
const environmentValues=process.env.KPI_RECONCILE_VALUES_JSON;
const persistMode=process.env.KPI_RECONCILE_PERSIST_MODE;
const summaryOnly=process.env.KPI_RECONCILE_SUMMARY_ONLY==="true";
let values;
if(path){values=JSON.parse(await readFile(path,"utf8"));}
else if(environmentValues){values=JSON.parse(environmentValues);}
else{values=[["Slack Item ID","Project","Member","Type","Status","URL","Date"],["fixture-1","PrintYourWear","Fixture Member","Audit","Review","https://app.bloggle.app/editor/1","2026-07-01"],["fixture-1","Print Your Wear","Fixture Member","Audit","Completed","https://example.com/live?utm_source=fixture","2026-07-03"],["fixture-2","Polynesian Pride Blog","Fixture Member","New Content","Checked","https://example.com/checked","2026-07-04"]];}
if(!Array.isArray(values)||!Array.isArray(values[0]))throw new Error("Input must be a JSON array of Sheet rows, including the header row.");
const result=reconcileWorkSourceRows(parseSlackListSheet(values));
if(persistMode&&!['raw','events'].includes(persistMode))throw new Error("KPI_RECONCILE_PERSIST_MODE must be raw or events.");
const approvalReason=process.env.KPI_RECONCILE_APPROVAL_REASON?.trim()||null;
if(persistMode==="events"&&!approvalReason)throw new Error("KPI_RECONCILE_APPROVAL_REASON is required for event persistence.");
const persistence=persistMode?await persistWorkSourceReconciliation(result,process.env.KPI_RECONCILE_ACTOR||"kpi-v2-reconcile",{persistEvents:persistMode==="events",approvalReason}):null;
const report={mode:path?"input_file":environmentValues?"environment_snapshot":"safe_fixture",sourcePath:path??null,...result.diagnostics,persistence,...(!summaryOnly?{canonicalItems:result.canonicalRows.map((row)=>({logicalKey:row.logicalKey,sourceItemId:row.sourceItemId,project:row.project,member:row.member,workType:row.workType,status:row.status,canonicalUrl:row.canonicalUrl,isCountable:row.isCountable,issues:row.issues})),quarantine:result.quarantinedRows.map((row)=>({sourceRowNumber:row.sourceRowNumber,sourceItemId:row.sourceItemId,issues:row.issues}))}:{})};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
