import { transaction } from "../db";
import { isShadowDifferenceExplained, type ShadowDifferenceInput } from "../kpi/shadow-evidence";
import { monthKey } from "./monthly-kpi";
import { nullableNumber } from "./score-mapper";
export type { ShadowDifferenceInput } from "../kpi/shadow-evidence";

export async function replaceShadowDifferences(input: { month: string; memberName: string; rows: ShadowDifferenceInput[]; actor: string }) {
  if (!input.memberName.trim()) throw new Error("Member is required.");
  if (!input.rows.length) throw new Error("At least one shadow comparison row is required.");
  const month = monthKey(input.month);
  return transaction(async (client) => {
    await client.query(`delete from public.monthly_kpi_shadow_differences where month_key=$1 and member_name=$2`, [month, input.memberName]);
    const saved = [];
    for (const row of input.rows) {
      if (!row.componentKey?.trim()) throw new Error("Every shadow row requires componentKey.");
      const sheetValue = nullableNumber(row.sheetValue);
      const v2Value = nullableNumber(row.v2Value);
      const delta = sheetValue === null || v2Value === null ? null : v2Value - sheetValue;
      const isExplained = isShadowDifferenceExplained(row, delta);
      const result = await client.query(`insert into public.monthly_kpi_shadow_differences
        (month_key,member_name,component_key,source_url,work_event_id,rule_version,sheet_value,v2_value,delta,
         explanation_category,explanation,is_explained,evidence,reviewed_by,reviewed_at,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,now(),now(),now()) returning *`, [
        month, input.memberName, row.componentKey.trim(), row.sourceUrl ?? null, row.workEventId ?? null, row.ruleVersion ?? null,
        sheetValue, v2Value, delta, row.explanationCategory ?? (delta === 0 ? "matched" : null),
        row.explanation ?? (delta === 0 ? "Values match." : null), isExplained, JSON.stringify(row.evidence ?? {}), input.actor,
      ]);
      saved.push(result.rows[0]);
    }
    return { rows: saved, unexplained: saved.filter((row) => !row.is_explained).length };
  });
}

export async function saveShadowApproval(input: { month: string; memberName: string; role: "pm" | "finance"; status: "pending" | "approved" | "rejected"; note?: string | null; actor: string }) {
  const month = monthKey(input.month);
  return transaction(async (client) => {
    const evidence = await client.query(`select count(*)::int total,count(*) filter(where not is_explained)::int unexplained,
      count(distinct member_name)::int members from public.monthly_kpi_shadow_differences where month_key=$1 and member_name=$2`, [month, input.memberName]);
    if (input.status === "approved" && (evidence.rows[0]?.total === 0 || evidence.rows[0]?.unexplained > 0))
      throw new Error("Approval requires shadow evidence with zero unexplained differences.");
    const result = await client.query(`insert into public.monthly_kpi_shadow_approvals
      (month_key,member_name,approval_role,status,approver,note,evidence_snapshot,approved_at,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7::jsonb,case when $4='approved' then now() else null end,now(),now())
      on conflict(month_key,member_name,approval_role) do update set status=excluded.status,approver=excluded.approver,
      note=excluded.note,evidence_snapshot=excluded.evidence_snapshot,approved_at=excluded.approved_at,updated_at=now() returning *`, [
      month, input.memberName, input.role, input.status, input.actor, input.note ?? null, JSON.stringify(evidence.rows[0] ?? {}),
    ]);
    return result.rows[0];
  });
}
