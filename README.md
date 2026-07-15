# SEO Performance Workspace

An auditable Next.js application for SEO source reconciliation, project configuration, lifecycle-aware GSC performance, monthly content review, and locked member KPI snapshots.

## Canonical architecture

```text
Performance SEO database / content_urls (read-only)
-> Source Pipeline normalization
-> versioned domain -> project classification
-> validation / needs-attention queue
-> canonical URL + immutable work events
-> GSC daily snapshots
-> Performance Service + Member Review
-> per-member, versioned Final KPI snapshot
```

Downstream pages and calculators read Postgres canonical records. They do not read Google Sheets directly and do not independently infer project identity.

## Workspaces

Admin navigation contains exactly:

- `/admin/sync` - preview and idempotently commit the canonical Content Sheet pipeline.
- `/admin/projects` - select a known project; resolve domain automatically; configure lifecycle, accessible GSC property, and 3M/6M/All Time weights.
- `/admin/data-source` - classified URLs/work events with distinct Source, GSC, and KPI states and freshness.
- `/admin/member-performance` - one Performance Service across 3M, 6M, and All Time, rolled up by eligible work units.
- `/admin/member-review` - Member x Month targets, URL rubric scoring, Quantity, Quality, and SEO Content.
- `/admin/kpi-close` - per-Member x Month weights, optional Social + Video/N/A, preview, lock, audit export, and versioned reopen.

Member navigation contains exactly:

- `/dashboard` - My Performance, defaulting to current 3M context with 6M/All Time diagnostics.
- `/my-urls` - current-month canonical work events and approved review feedback.
- `/my-kpi` - component breakdown and Final KPI snapshot.

Old pages redirect to these routes. Legacy Sheet sync, legacy range refresh, and legacy Project KPI Settings write endpoints return `410 Gone`; historical read models remain only for shadow comparison.

## Data and scoring rules

- Primary source is spreadsheet `1NacfG23BnkKY0ZMktfhDxpZ7cnNGdQRf_UrwQ5kfOIQ`, tab `content_urls`, with the exact headers `project | url | member_name | date | type`.
- The Content Sheet event identity is Project + canonical URL + Member + Date + Type. Legacy/Slack lineage may be linked for migration evidence but is not the normal source.
- Unknown project/member/type/date/URL is needs-attention data, never guessed into payroll.
- GSC runs only for `gsc_ready` canonical URLs; KPI runs only for `kpi_ready` countable events.
- Missing/API error is not observed zero. N/A is not zero.
- Performance uses Impression 40%, Click 20%, Growth Coverage 25%, and Portfolio Health 15% within the lifecycle strategy.
- Project ranges use explicit 3M/6M/All Time weights. Member rollup is automatic from eligible member work units in scored projects; system errors block rather than renormalize.
- SEO Content uses Quantity and approved Quality. Raw overachievement remains visible; payable scores are capped at 100%.
- Final KPI configuration is versioned per Member x Month and contains only SEO Content, SEO Performance, and optional Social + Video. No production weights are seeded.
- Locked results are immutable. Reopen preserves the old version and creates a new audited version.

## Local setup

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Required integrations are Google OAuth/Sheets/Search Console and Postgres/Neon. Production writes stay disabled unless both the unified feature flag and explicit production-write flag are enabled.

## Migration order

For an isolated Preview/staging branch, use the guarded runner with that branch connection string supplied by the operator or secret manager:

```bash
VERCEL_ENV=preview DATABASE_URL="$STAGING_DATABASE_URL" npm run db:migrate:unified -- --apply --verify-idempotent --acknowledge-staging
```

Neon connection strings should use `sslmode=verify-full`; the runtime normalizes older Neon `require` URLs while preserving channel binding.

The guarded runner applies `20260710_monthly_kpi.sql`, `20260714_monthly_kpi_engine_v2.sql`, `20260715_unified_application.sql`, and `20260715_unified_remediation.sql` in order. It verifies the schema and preserves pre-migration URL/work-event row counts.

Never apply `migrations/001_simple_cache_schema.sql` to a populated database: it is a destructive baseline for a new/reset environment. No migration or backfill runs automatically in the app.

After staging migration, verify `/api/health/db`; required tables/columns must not appear in `missingTables`, `missingColumns`, or `migrationWarnings`.

## Feature flags

```text
UNIFIED_APP_ENABLED=false
UNIFIED_PRODUCTION_WRITE_ENABLED=false
```

`KPI_ENGINE_V2_ENABLED` is a temporary compatibility alias. New deployments should use `UNIFIED_APP_ENABLED`.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
git diff --check
```

Tests use fixtures/mocks and never production Sheet/GSC data. Live validation is read-only or runs only on the isolated Preview branch. See the [staging runbook](docs/UNIFIED_STAGING_RUNBOOK.md) and [remediation checkpoint](docs/UNIFIED_REMEDIATION_CHECKPOINT.md).

## Rollback

Disable `UNIFIED_APP_ENABLED` to stop Unified writes while retaining audit history. The guarded down migrations are only for empty, pre-acceptance schemas; never delete locked snapshots, review history, or audit lineage.
