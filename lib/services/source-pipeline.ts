import { syncKpiV2WorkSource } from "../sync/kpi-v2";

export function previewSourcePipeline(input:{accessToken:string;actor:string}) {
  return syncKpiV2WorkSource({...input,dryRun:false,persistEvents:false});
}

export function commitSourcePipeline(input:{accessToken:string;actor:string;approvalReason:string}) {
  return syncKpiV2WorkSource({...input,dryRun:false,persistEvents:true,approvalReason:input.approvalReason});
}
