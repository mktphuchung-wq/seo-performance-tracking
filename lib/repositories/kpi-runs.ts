import { createHash, randomUUID } from "node:crypto";
import { query, transaction } from "../db";
import { KpiApiError } from "../kpi/api-contract";
import { monthKey } from "./monthly-kpi";

export type KpiRunStep = "sync" | "target" | "review" | "performance" | "calculate" | "finalize" | "reopen";

const hashRequest = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");

export async function runIdempotentKpiStep<T>(input: {
  step: KpiRunStep;
  month: string;
  memberName?: string | null;
  actor: string;
  requestId: string;
  idempotencyKey: string;
  requestPayload: unknown;
  ruleVersion?: string | null;
  operation: (runId: string) => Promise<T>;
}): Promise<{ result: T; replayed: boolean; runId: string }> {
  const month = monthKey(input.month);
  const scope = `${input.step}:${month}:${input.memberName ?? "*"}`;
  const requestHash = hashRequest(input.requestPayload);
  const prepared = await transaction(async (client) => {
    const existing = await client.query(`select * from public.monthly_kpi_idempotency_keys where scope=$1 and idempotency_key=$2 for update`, [scope, input.idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) throw new KpiApiError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used with a different request.", 409, "Idempotency-Key");
      if (existing.rows[0].status === "completed") return { replay: true, result: existing.rows[0].response_payload as T, runId: String(existing.rows[0].run_id) };
      if (existing.rows[0].status === "running") throw new KpiApiError("WORKFLOW_ALREADY_RUNNING", "An identical workflow action is already running.", 409, null, true);
      throw new KpiApiError("IDEMPOTENT_REQUEST_FAILED", "The previous identical request failed. Use a new Idempotency-Key after correcting the cause.", 409);
    }
    const runId = randomUUID();
    await client.query(`insert into public.monthly_kpi_calculation_runs
      (id,request_id,month_key,member_name,step,status,actor,rule_version,diagnostics,started_at,created_at)
      values($1,$2,$3,$4,$5,'running',$6,$7,$8::jsonb,now(),now())`, [
      runId, input.requestId, month, input.memberName ?? null, input.step, input.actor, input.ruleVersion ?? null,
      JSON.stringify({ idempotencyScope: scope }),
    ]);
    await client.query(`insert into public.monthly_kpi_idempotency_keys
      (scope,idempotency_key,request_hash,status,run_id,created_at,updated_at)
      values($1,$2,$3,'running',$4,now(),now())`, [scope, input.idempotencyKey, requestHash, runId]);
    return { replay: false, runId };
  });
  if (prepared.replay) return { result: prepared.result!, replayed: true, runId: prepared.runId };
  try {
    const result = await input.operation(prepared.runId);
    await transaction(async (client) => {
      await client.query(`update public.monthly_kpi_calculation_runs set status='completed',diagnostics=diagnostics||$2::jsonb,finished_at=now() where id=$1`, [prepared.runId, JSON.stringify({ completed: true })]);
      await client.query(`update public.monthly_kpi_idempotency_keys set status='completed',response_status=200,response_payload=$3::jsonb,updated_at=now() where scope=$1 and idempotency_key=$2`, [scope, input.idempotencyKey, JSON.stringify(result)]);
    });
    return { result, replayed: false, runId: prepared.runId };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]") : "Workflow operation failed";
    await Promise.all([
      query(`update public.monthly_kpi_calculation_runs set status='failed',error_code=$2,error_message=$3,finished_at=now() where id=$1`, [prepared.runId, error instanceof KpiApiError ? error.code : "KPI_WORKFLOW_ERROR", message]).catch(() => undefined),
      query(`update public.monthly_kpi_idempotency_keys set status='failed',response_status=$3,response_payload=$4::jsonb,updated_at=now() where scope=$1 and idempotency_key=$2`, [scope, input.idempotencyKey, error instanceof KpiApiError ? error.status : 500, JSON.stringify({ error: message })]).catch(() => undefined),
    ]);
    throw error;
  }
}
