import { transaction } from "../db";
import type { FinalKpiResult } from "../kpi/monthly-final";

const monthKey = (value: string) =>
  /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;

export async function finalizeAndLockMemberMonth(input: {
  month: string;
  memberName: string;
  result: FinalKpiResult;
  actor: string;
  acknowledgementReason?: string | null;
}) {
  if (
    input.result.state !== "scored" ||
    input.result.payablePct === null ||
    input.result.payoutVnd === null
  )
    throw new Error(
      `Month cannot be finalized: ${input.result.reason ?? input.result.state}`,
    );
  return transaction(async (client) => {
    const versionResult = await client.query(
      `select coalesce(max(version),0)+1 as version from public.monthly_member_kpi_results where month_key=$1 and member_name=$2`,
      [monthKey(input.month), input.memberName],
    );
    const version = Number(versionResult.rows[0].version);
    const audit = [
      {
        action: "calculated",
        actor: input.actor,
        at: new Date().toISOString(),
      },
      { action: "approved", actor: input.actor, at: new Date().toISOString() },
      { action: "locked", actor: input.actor, at: new Date().toISOString() },
    ];
    const inserted = await client.query(
      `insert into public.monthly_member_kpi_results
      (month_key,member_name,version,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,
       payout_base_vnd,payout_vnd,source_ids,audit_trail,snapshot_payload,calculated_at,approved_by,approved_at,locked_by,locked_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'locked',3000000,$11,$12::jsonb,$13::jsonb,$14::jsonb,now(),$15,now(),$15,now(),now(),now()) returning *`,
      [
        monthKey(input.month),
        input.memberName,
        version,
        input.result.rawPct,
        input.result.payablePct,
        input.result.coveragePct,
        input.result.confidence,
        input.result.sourceCohort,
        input.result.ruleVersion,
        input.acknowledgementReason ?? input.result.overrideReason,
        input.result.payoutVnd,
        JSON.stringify(input.result.sourceIds),
        JSON.stringify(audit),
        JSON.stringify(input.result),
        input.actor,
      ],
    );
    const configId = String(input.result.diagnostics.configId ?? "");
    if (configId)
      await client.query(
        `update public.monthly_member_kpi_configs set status='locked',locked_by=$2,locked_at=now(),updated_at=now()
      where id=$1 and month_key=$3 and member_name=$4 and status='approved'`,
        [configId, input.actor, monthKey(input.month), input.memberName],
      );
    await client.query(
      `update public.monthly_member_targets set status='locked',locked_by=$3,locked_at=now(),updated_at=now()
      where month_key=$1 and member_name=$2 and status='approved'`,
      [monthKey(input.month), input.memberName, input.actor],
    );
    return inserted.rows[0];
  });
}

export async function reopenLockedMemberMonth(input: {
  resultId: string;
  actor: string;
  reason: string;
}) {
  if (!input.reason.trim()) throw new Error("A reopen reason is required.");
  return transaction(async (client) => {
    const previous = await client.query(
      `select * from public.monthly_member_kpi_results where id=$1 and status='locked' limit 1`,
      [input.resultId],
    );
    if (!previous.rows[0]) throw new Error("Locked KPI result not found.");
    const row = previous.rows[0];
    const next = await client.query(
      `insert into public.monthly_member_kpi_results
      (month_key,member_name,version,raw_pct,payable_pct,coverage_pct,confidence,source_cohort,rule_version,override_reason,status,payout_base_vnd,payout_vnd,
       source_ids,audit_trail,snapshot_payload,calculated_at,reopened_from_id,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,now(),$16,now(),now()) returning *`,
      [
        row.month_key,
        row.member_name,
        Number(row.version) + 1,
        row.raw_pct,
        row.payable_pct,
        row.coverage_pct,
        row.confidence,
        row.source_cohort,
        row.rule_version,
        input.reason,
        row.payout_base_vnd,
        row.payout_vnd,
        JSON.stringify(row.source_ids),
        JSON.stringify([
          ...(row.audit_trail ?? []),
          {
            action: "reopened",
            actor: input.actor,
            reason: input.reason,
            at: new Date().toISOString(),
          },
        ]),
        JSON.stringify(row.snapshot_payload),
        row.id,
      ],
    );
    await client.query(
      `insert into public.kpi_override_audit_log(month_key,member_name,component_key,entity_type,entity_id,before_value,after_value,reason,actor,action)
      values($1,$2,'final_kpi','monthly_member_kpi_result',$3,$4::jsonb,$5::jsonb,$6,$7,'reopen')`,
      [
        row.month_key,
        row.member_name,
        row.id,
        JSON.stringify(row),
        JSON.stringify(next.rows[0]),
        input.reason,
        input.actor,
      ],
    );
    const lockedConfig = await client.query(
      `select * from public.monthly_member_kpi_configs where month_key=$1 and member_name=$2 and status='locked' order by version desc limit 1`,
      [row.month_key, row.member_name],
    );
    let nextConfig = null;
    if (lockedConfig.rows[0]) {
      const previousConfig = lockedConfig.rows[0];
      const insertedConfig = await client.query(
        `insert into public.monthly_member_kpi_configs
        (month_key,member_id,member_name,version,status,social_video_enabled,reason,created_by,reopened_from_id,created_at,updated_at)
        values($1,$2,$3,$4,'draft',$5,$6,$7,$8,now(),now()) returning *`,
        [
          previousConfig.month_key,
          previousConfig.member_id,
          previousConfig.member_name,
          Number(previousConfig.version) + 1,
          previousConfig.social_video_enabled,
          input.reason,
          input.actor,
          previousConfig.id,
        ],
      );
      nextConfig = insertedConfig.rows[0];
      await client.query(
        `insert into public.monthly_member_kpi_config_components(config_id,component_key,weight_pct,is_required,allows_na,display_order)
        select $1,component_key,weight_pct,is_required,allows_na,display_order from public.monthly_member_kpi_config_components where config_id=$2`,
        [nextConfig.id, previousConfig.id],
      );
    }
    await client.query(
      `update public.monthly_member_targets set status='approved',locked_by=null,locked_at=null,updated_at=now()
      where month_key=$1 and member_name=$2 and status='locked'`,
      [row.month_key, row.member_name],
    );
    return { previous: row, next: next.rows[0], nextConfig };
  });
}
