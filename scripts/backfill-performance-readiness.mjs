import process from "node:process";
import pg from "pg";
import { normalizePostgresConnectionString } from "../lib/database-url.ts";
import { registrableDomain } from "../lib/domain/project-settings.ts";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const acknowledged = args.has("--acknowledge-staging");
const environment = process.env.VERCEL_ENV ?? process.env.DEPLOYMENT_ENVIRONMENT ?? "unknown";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!['preview','staging'].includes(environment))
  throw new Error(`Refusing eligibility backfill for environment=${environment}.`);
if (apply && !acknowledged)
  throw new Error("Pass --acknowledge-staging after confirming the Neon branch is isolated.");
if (process.env.UNIFIED_PRODUCTION_WRITE_ENABLED === "true")
  throw new Error("Refusing backfill while production writes are enabled.");
const parsed = new URL(process.env.DATABASE_URL);
if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("DATABASE_URL is not a Neon hostname.");

const client = new pg.Client({ connectionString: normalizePostgresConnectionString(process.env.DATABASE_URL) });
await client.connect();
try {
  const before = await client.query(`select
    count(*) filter(where coalesce(is_active,true))::int active_urls,
    count(*) filter(where coalesce(is_active,true) and classification_status='accepted')::int accepted_urls,
    count(*) filter(where coalesce(is_active,true) and classification_status='pending')::int pending_urls,
    count(*) filter(where coalesce(is_active,true) and classification_status='quarantined')::int quarantined_urls
    from public.content_urls`);
  const sourceCounts = await client.query(`select count(*)::int content_urls from public.content_urls`);
  const eventCounts = await client.query(`select count(*)::int work_events from public.url_work_events`);
  const rows = await client.query(`select c.id::text,c.project,c.url,c.project_id::text,c.normalized_domain,c.classification_status,
    p.id::text resolved_project_id,p.canonical_domain,p.include_subdomains,p.gsc_access_status,p.gsc_ready,
    duplicate.id::text duplicate_canonical_id
    from public.content_urls c left join public.projects p on p.canonical_name=c.project
    left join public.content_urls duplicate on duplicate.project_id=p.id and duplicate.url=c.url and duplicate.id<>c.id
    where coalesce(c.is_active,true)=true and(c.normalized_domain is null or c.classification_status='pending') order by c.id`);
  const changes = rows.rows.map((row) => {
    let hostname = null;
    try { hostname = new URL(row.url).hostname.toLowerCase().replace(/^www\./, ""); } catch {}
    const canonical = String(row.canonical_domain ?? "").toLowerCase().replace(/^www\./, "");
    const domainAllowed = Boolean(hostname && canonical && (hostname === canonical || (row.include_subdomains && hostname.endsWith(`.${canonical}`))));
    const accepted = Boolean(row.resolved_project_id && hostname && domainAllowed && !row.duplicate_canonical_id);
    const gscEligible = accepted && row.gsc_access_status === "verified" && Boolean(row.gsc_ready);
    const reasons = accepted ? [] : [
      row.duplicate_canonical_id
        ? "duplicate_canonical_url"
        : !row.resolved_project_id
          ? "project_unresolved"
          : !hostname
            ? "url_invalid"
            : "project_domain_unapproved",
    ];
    return {
      id: row.id,
      url: row.url,
      before: { projectId: row.project_id, hostname: row.normalized_domain, classification: row.classification_status },
      after: {
        // A duplicate legacy row must stay detached from the canonical project identity.
        // Its source row remains auditable while the existing canonical UUID owns events.
        projectId: accepted ? row.resolved_project_id : row.project_id,
        hostname,
        registrableDomain: hostname ? registrableDomain(hostname) : null,
        classification: accepted ? "accepted" : "quarantined",
        classificationIssues: reasons,
        gscReady: gscEligible,
        gscEligibilityReason: gscEligible ? "verified_property_scope" : accepted ? "gsc_property_unverified" : reasons[0],
      },
    };
  });
  const summary = {
    mode: apply ? "apply" : "dry_run",
    environment,
    host: parsed.hostname,
    before: before.rows[0],
    candidates: changes.length,
    acceptedAfter: changes.filter((row) => row.after.classification === "accepted").length,
    quarantinedAfter: changes.filter((row) => row.after.classification === "quarantined").length,
    changes,
  };
  console.log(JSON.stringify(summary));
  if (apply) {
    await client.query("begin");
    for (const change of changes) {
      await client.query(`update public.content_urls set project_id=$2,normalized_domain=$3,registrable_domain=$4,
        classification_status=$5,classification_issues=$6::jsonb,classification_version='source_pipeline_v2',classified_at=now(),
        gsc_ready=$7,gsc_eligibility_reason=$8,updated_at=now() where id=$1`,[
        change.id,change.after.projectId,change.after.hostname,change.after.registrableDomain,change.after.classification,
        JSON.stringify(change.after.classificationIssues),change.after.gscReady,change.after.gscEligibilityReason,
      ]);
    }
    await client.query(`update public.url_work_events e set
      content_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active' and c.classification_status='accepted'),
      kpi_ready=(e.is_countable and coalesce(e.unified_source_state,'active')='active' and c.classification_status='accepted'),
      performance_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active' and c.classification_status='accepted' and c.gsc_ready),
      performance_readiness_state=case when not e.is_countable or c.classification_status<>'accepted' then 'blocked_system_error' when c.gsc_ready then 'fallback' else 'pm_review' end,
      performance_readiness_issues=case when not e.is_countable then jsonb_build_array(coalesce(e.exclusion_reason,'event_not_countable')) when c.classification_status<>'accepted' then '["classification_pending"]'::jsonb when not c.gsc_ready then '["gsc_property_unverified"]'::jsonb else '[]'::jsonb end,
      readiness_issues=coalesce(e.readiness_issues,'[]'::jsonb)-'project_not_kpi_ready',updated_at=now()
      from public.content_urls c where c.id=e.content_url_id`);
    const afterSource = await client.query(`select count(*)::int content_urls from public.content_urls`);
    const afterEvents = await client.query(`select count(*)::int work_events from public.url_work_events`);
    if (afterSource.rows[0].content_urls !== sourceCounts.rows[0].content_urls || afterEvents.rows[0].work_events !== eventCounts.rows[0].work_events)
      throw new Error("Source row counts changed during eligibility backfill.");
    await client.query("commit");
    console.log(JSON.stringify({ phase: "committed", sourceRowsPreserved: true, contentUrls: afterSource.rows[0].content_urls, workEvents: afterEvents.rows[0].work_events }));
  }
} catch (error) {
  if (apply) await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
