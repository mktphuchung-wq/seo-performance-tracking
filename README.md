# SEO Performance Workspace

An auditable Next.js application for SEO source reconciliation, project configuration, lifecycle-aware GSC performance, monthly content review, and locked member KPI snapshots.

## Canonical architecture

```text
Sheet raw rows
→ Source Pipeline normalization
→ versioned domain → project classification
→ validation / quarantine
→ canonical URL + immutable work events
→ GSC daily snapshots
→ Performance Service + Member Review
→ versioned Final KPI snapshot
```

Downstream pages and calculators read Postgres canonical records. They do not read Google Sheets directly and do not independently infer project identity.

## Workspaces

Admin navigation contains exactly:

- `/admin/sync` — preview and commit the canonical source pipeline.
- `/admin/projects` — one Project Settings UI for domain, lifecycle, GSC/KPI readiness, 3M/6M/All Time weights, and member-project contribution weights.
- `/admin/data-source` — accepted URLs/work events, readiness, source lineage, and quarantine.
- `/admin/member-performance` — one Performance Service across 3M, 6M, and All Time.
- `/admin/member-review` — targets, URL rubric scoring, notes, Quantity, Quality, and SEO Content.
- `/admin/kpi-close` — KPI Template, Social + Video/N/A, preview, lock, audit export, and versioned reopen.

Member navigation contains exactly:

- `/dashboard` — My Performance, defaulting to the current 3M context with 6M/All Time diagnostics.
- `/my-urls` — current-month canonical work events and approved review feedback.
- `/my-kpi` — component breakdown and Final KPI snapshot.

Old pages redirect to these routes. Legacy Sheet sync, legacy range refresh, and legacy Project KPI Settings write endpoints return `410 Gone`; their read models remain available only for shadow comparison during migration.

## Data and scoring rules

- Project identity comes from normalized domain and an effective-dated domain mapping. Sheet project labels are reconciliation evidence only.
- Slack/source item ID is the primary logical work key. Draft/live variants do not count twice.
- Unknown project/member/type/status/date/URL is quarantined, never guessed into payroll.
- GSC runs only for `gsc_ready` canonical URLs; KPI runs only for `kpi_ready` countable events.
- Missing/API error is not observed zero. N/A is not zero.
- Performance uses Impression 40%, Click 20%, Growth Coverage 25%, and Portfolio Health 15% within the lifecycle strategy.
- Project ranges use explicit 3M/6M/All Time weights. Member rollup uses explicit member-project contribution weights; equal weighting is not a fallback.
- SEO Content uses Quantity and approved Quality. Raw overachievement remains visible; payable scores are capped at 100%.
- Final KPI templates contain only SEO Content, SEO Performance, and optional Social + Video. No production weights are seeded by migration.
- Locked results are immutable. Reopen preserves the old version and creates a new audited version.

## Local setup

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Required integrations are Google OAuth/Sheets/Search Console and Postgres/Neon. Production writes stay disabled unless both the unified feature flag and the explicit production-write flag are enabled.

## Migration order

For an existing database already at KPI v2:

```bash
psql "$STAGING_DATABASE_URL" -f migrations/20260715_unified_application.sql
```

For a fresh staging database, apply the existing baseline/additive migrations in filename order through `20260714_monthly_kpi_engine_v2.sql`, then apply `20260715_unified_application.sql`.

Never apply `migrations/001_simple_cache_schema.sql` to a populated database: it is a destructive baseline intended only for a new/reset environment. No migration or backfill is executed automatically by the app.

After staging migration, verify `/api/health/db`; the unified tables/columns must not appear in `missingTables`, `missingColumns`, or `migrationWarnings`.

## Feature flags

```text
UNIFIED_APP_ENABLED=false
UNIFIED_PRODUCTION_WRITE_ENABLED=false
```

`KPI_ENGINE_V2_ENABLED` remains a temporary compatibility alias for staging deployments. New deployments should use `UNIFIED_APP_ENABLED`.

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

Tests use fixtures/mocks and never production Sheet/GSC data. See [staging runbook](docs/UNIFIED_STAGING_RUNBOOK.md) and [implementation checkpoint](docs/UNIFIED_APPLICATION_CHECKPOINT.md).

## Rollback

Before any unified business/audit rows exist, the guarded `migrations/20260715_unified_application_down.sql` can remove only the new objects. After data exists, rollback means disable unified writes and return to read-only shadow views; never delete locked snapshots or audit history.
