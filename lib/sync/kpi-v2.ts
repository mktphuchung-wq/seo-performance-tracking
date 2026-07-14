import { assertKpiV2WriteEnvironment } from "../env";
import { getMemberEmailMap } from "../env";
import { normalizeAliasKey } from "../domain/normalization";
import { getMemberAliases } from "../repositories/member-aliases";
import { getProjectAliases } from "../repositories/project-aliases";
import { persistWorkSourceReconciliation } from "../repositories/work-source-rows";
import { reconcileSlackListSheet } from "./slack-list-sheet";

export async function syncKpiV2WorkSource(input:{accessToken:string;actor:string;dryRun?:boolean;persistEvents?:boolean;approvalReason?:string|null}){
  const [projects,dbMembers]=await Promise.all([getProjectAliases(),getMemberAliases()]);
  const configuredMembers=Object.fromEntries(Object.keys(getMemberEmailMap()).map((name)=>[normalizeAliasKey(name),name]));
  const reconciliation=await reconcileSlackListSheet(input.accessToken,{projects,members:{...configuredMembers,...dbMembers}});
  if(input.dryRun)return{dryRun:true,...reconciliation.diagnostics,canonicalRows:reconciliation.canonicalRows.map((row)=>({logicalKey:row.logicalKey,sourceItemId:row.sourceItemId,project:row.project,member:row.member,workType:row.workType,status:row.status,canonicalUrl:row.canonicalUrl,isCountable:row.isCountable,issues:row.issues}))};
  assertKpiV2WriteEnvironment();
  if(input.persistEvents&&!input.approvalReason?.trim())throw new Error("An approval reason is required before canonical work events can be persisted.");
  return{dryRun:false,...await persistWorkSourceReconciliation(reconciliation,input.actor,{persistEvents:input.persistEvents,approvalReason:input.approvalReason})};
}
