import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";
import { newContentRubricV2 } from "../kpi/rubrics.ts";
import { normalizePostgresConnectionString } from "../database-url.ts";

const integrationUrl = process.env.INTEGRATION_DATABASE_URL;

test(
  "PostgreSQL Preview fixture persists eligible work, GSC evidence, and idempotent review prefill",
  { skip: !integrationUrl },
  async () => {
    const client = new pg.Client({
      connectionString: normalizePostgresConnectionString(integrationUrl),
    });
    await client.connect();
    await client.query("begin");

    const token = crypto.randomUUID();
    const memberName = `Integration ${token}`;
    const project = `Integration Project ${token}`;
    const url = `https://example.com/integration-${token}`;
    const urlHash = `integration-${token}`;

    try {
      const content = await client.query(
        `insert into public.content_urls(
          url_hash,project,url,member_name,is_active,source,classification_status,gsc_ready
        ) values($1,$2,$3,$4,true,'integration_fixture','accepted',false) returning id::text`,
        [urlHash, project, url, memberName],
      );
      const contentUrlId = content.rows[0].id;
      const event = await client.query(
        `insert into public.url_work_events(
          content_url_id,project,member_name,work_type,work_date,difficulty,unit_value,
          source,source_row_key,source_item_id,status,is_countable,content_kpi_eligible,
          performance_kpi_eligible,unified_source_state,
          canonical_url_snapshot,date_confidence
        ) values($1,$2,$3,'new_content','2026-07-16','normal',1.5,
          'integration_fixture',$4,$4,'completed',true,true,false,'active',$5,
          'manual_verified') returning id::text`,
        [contentUrlId, project, memberName, token, url],
      );
      const workEventId = event.rows[0].id;
      await client.query(
        `insert into public.gsc_url_daily_metrics(
          gsc_property,canonical_url,metric_date,data_status,clicks,impressions,ctr,position
        ) values('sc-domain:example.com',$1,'2026-07-16','observed_zero',0,0,0,null)`,
        [url],
      );

      const rubricVersion = await client.query(
        `select v.id::text from public.kpi_quality_rubric_versions v
         join public.kpi_quality_rubrics r on r.id=v.rubric_id
         where r.work_type='new_content' and v.version=$1 and v.status='approved' limit 1`,
        [newContentRubricV2.version],
      );
      assert.ok(rubricVersion.rows[0], "approved rubric seed must exist");

      const saveReview = async (score, adminNote) => {
        const review = await client.query(
          `insert into public.url_work_quality_reviews(
            work_event_id,review_status,quality_pct,admin_note,reviewed_by,reviewed_at,
            rubric_version_id,rubric_version_snapshot,criteria_snapshot,evidence
          ) values($1,'approved',$2,$3,'integration@example.com',now(),$4,$5,$6::jsonb,'{}'::jsonb)
          on conflict(work_event_id) do update set quality_pct=excluded.quality_pct,
            admin_note=excluded.admin_note,reviewed_at=now(),updated_at=now()
          returning id::text`,
          [
            workEventId,
            score * 20,
            adminNote,
            rubricVersion.rows[0].id,
            newContentRubricV2.version,
            JSON.stringify(newContentRubricV2.criteria),
          ],
        );
        await client.query("delete from public.url_work_quality_scores where review_id=$1", [review.rows[0].id]);
        for (const criterion of newContentRubricV2.criteria) {
          const definition = await client.query(
            `select id::text,criterion_name,weight_pct from public.kpi_quality_criteria
             where rubric_version_id=$1 and criterion_key=$2 limit 1`,
            [rubricVersion.rows[0].id, criterion.key],
          );
          const isNa = criterion.key === "links" && adminNote === "updated";
          await client.query(
            `insert into public.url_work_quality_scores(
              review_id,criterion_id,score,is_na,na_reason,criterion_key_snapshot,
              criterion_name_snapshot,weight_pct_snapshot,note
            ) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              review.rows[0].id,
              definition.rows[0].id,
              isNa ? null : score,
              isNa,
              isNa ? "No relevant external link" : null,
              criterion.key,
              definition.rows[0].criterion_name,
              definition.rows[0].weight_pct,
              isNa ? "No relevant external link" : `${adminNote} fixture review`,
            ],
          );
        }
      };

      await saveReview(4, "first");
      await saveReview(3, "updated");

      const audit = await client.query(
        `select e.id::text as work_event_id,r.admin_note,r.quality_pct,
          coalesce(jsonb_agg(jsonb_build_object(
            'criterionKey',s.criterion_key_snapshot,'score',s.score,'isNa',s.is_na,
            'naReason',s.na_reason,'note',s.note
          ) order by s.id),'[]'::jsonb) as saved_criteria
         from public.url_work_events e
         join public.url_work_quality_reviews r on r.work_event_id=e.id
         left join public.url_work_quality_scores s on s.review_id=r.id
         where e.id=$1 and e.content_kpi_eligible=true and e.is_countable=true
         group by e.id,r.id`,
        [workEventId],
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].admin_note, "updated");
      assert.equal(audit.rows[0].saved_criteria.length, newContentRubricV2.criteria.length);
      assert.equal(
        audit.rows[0].saved_criteria.find((row) => row.criterionKey === "links").isNa,
        true,
      );

      const counts = await client.query(
        `select
          (select count(*) from public.url_work_quality_reviews where work_event_id=$1)::int as reviews,
          (select count(*) from public.gsc_url_daily_metrics where canonical_url=$2 and data_status='observed_zero')::int as zero_rows,
          (select count(*) from public.url_work_events where id=$1 and content_kpi_eligible=true and performance_kpi_eligible=false)::int as content_without_performance`,
        [workEventId, url],
      );
      assert.deepEqual(counts.rows[0], {
        reviews: 1,
        zero_rows: 1,
        content_without_performance: 1,
      });
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);
