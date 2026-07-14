import { transaction } from "../db";
import type { WorkType } from "../domain/work-events";
import { calculateEventQuality, type CriterionReview } from "../kpi/quality";
import { rubricForWorkType } from "../kpi/rubrics";

export async function saveQualityReview(input: { workEventId: string; criteria: CriterionReview[]; status: "approved" | "excluded"; exclusionReason?: string | null; adminNote?: string | null; evidence?: Record<string, unknown>; reviewer: string }) {
  return transaction(async (client) => {
    const event = await client.query(`select id::text,work_type,unit_value from public.url_work_events where id=$1 and is_countable=true limit 1`, [input.workEventId]);
    if (!event.rows[0]) throw new Error("Countable work event not found.");
    const workType = event.rows[0].work_type as WorkType;
    const rubric = rubricForWorkType(workType);
    if (!rubric) throw new Error(`Quality reviews do not apply to work type ${workType}.`);
    if (input.status === "excluded" && !input.exclusionReason?.trim()) throw new Error("An exclusion reason is required.");
    const evaluation = input.status === "approved" ? calculateEventQuality({ eventId: input.workEventId, unitValue: Number(event.rows[0].unit_value), rubric, criteria: input.criteria, status: "approved" }) : null;
    if (evaluation?.qualityPct === null) throw new Error(`Quality review is incomplete: ${evaluation?.issues.join(", ")}`);
    const version = await client.query(`select v.id::text from public.kpi_quality_rubric_versions v
      join public.kpi_quality_rubrics r on r.id=v.rubric_id where r.work_type=$1 and v.version=$2 and v.status='approved' limit 1`, [workType,rubric.version]);
    if (!version.rows[0]) throw new Error(`Approved rubric version ${rubric.version} is missing from the database.`);
    const review = await client.query(`insert into public.url_work_quality_reviews
      (work_event_id,review_status,quality_pct,exclusion_reason,admin_note,reviewed_by,reviewed_at,approved_by,approved_at,
       rubric_version_id,rubric_version_snapshot,criteria_snapshot,evidence,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,now(),$6,now(),$7,$8,$9::jsonb,$10::jsonb,now(),now())
      on conflict(work_event_id) do update set review_status=excluded.review_status,quality_pct=excluded.quality_pct,
      exclusion_reason=excluded.exclusion_reason,admin_note=excluded.admin_note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,
      approved_by=excluded.approved_by,approved_at=excluded.approved_at,
      rubric_version_id=excluded.rubric_version_id,rubric_version_snapshot=excluded.rubric_version_snapshot,
      criteria_snapshot=excluded.criteria_snapshot,evidence=excluded.evidence,updated_at=now() returning id::text`, [
      input.workEventId,input.status,evaluation?.qualityPct ?? null,input.status === "excluded" ? input.exclusionReason : null,
      input.adminNote ?? null,input.reviewer,version.rows[0].id,rubric.version,JSON.stringify(rubric.criteria),JSON.stringify(input.evidence ?? {}),
    ]);
    await client.query(`delete from public.url_work_quality_scores where review_id=$1`, [review.rows[0].id]);
    if (input.status === "approved") {
      for (const answer of input.criteria) {
        const criterion = await client.query(`select id::text,criterion_name,weight_pct from public.kpi_quality_criteria
          where rubric_version_id=$1 and criterion_key=$2 limit 1`, [version.rows[0].id,answer.criterionKey]);
        if (!criterion.rows[0]) throw new Error(`Criterion ${answer.criterionKey} is not part of rubric ${rubric.version}.`);
        await client.query(`insert into public.url_work_quality_scores
          (review_id,criterion_id,score,is_na,na_reason,evidence,criterion_key_snapshot,criterion_name_snapshot,weight_pct_snapshot,note,created_at,updated_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`, [review.rows[0].id,criterion.rows[0].id,answer.isNa ? null : answer.score,Boolean(answer.isNa),answer.naReason ?? null,answer.evidence ?? null,answer.criterionKey,criterion.rows[0].criterion_name,criterion.rows[0].weight_pct,answer.note ?? null]);
      }
    }
    return { reviewId: review.rows[0].id, qualityPct: evaluation?.qualityPct ?? null, rubricVersion: rubric.version, issues: evaluation?.issues ?? [] };
  });
}

export async function listQualityReviewQueue(month: string, memberName?: string) {
  const { query } = await import("../db");
  const result = await query(`select e.id::text as work_event_id,e.project,e.member_name,e.work_type,e.work_date::text,
    e.unit_value,e.canonical_url_snapshot,r.review_status,r.quality_pct,r.rubric_version_snapshot
    from public.url_work_events e left join public.url_work_quality_reviews r on r.work_event_id=e.id
    where e.is_countable=true and e.work_date>=date_trunc('month',$1::date) and e.work_date<date_trunc('month',$1::date)+interval '1 month'
    ${memberName ? "and e.member_name=$2" : ""} order by e.member_name,e.project,e.work_date,e.id`, memberName ? [month,memberName] : [month]);
  return result.rows;
}
