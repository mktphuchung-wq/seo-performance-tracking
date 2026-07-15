# Unified Application Implementation Checkpoint

Recorded on 2026-07-15 for branch `codex/unified-seo-kpi-app`.

## Files and architecture

- Added one audited Source Pipeline facade and canonical Data Source repository.
- Added one versioned Project Settings model/UI/API, including domain mapping, readiness, range weights, and member-project contribution weights.
- Added one Performance Service with pure 3M/6M/All Time aggregation, project/member weighting, coverage/confidence, and system-error blocking.
- Changed Final KPI configuration to a versioned three-component template: SEO Content, SEO Performance, and Social + Video.
- Added the six required Admin pages, three required Member pages, session-derived member APIs, and compatibility redirects.
- Made legacy sync/refresh/settings write endpoints read-only (`410 Gone`).

## Migration impact

`migrations/20260715_unified_application.sql` is additive and idempotent. It adds effective-dated project/domain/settings records, member contribution weights, canonical readiness/classification columns, Performance range results, KPI templates, Social N/A evidence, and a cross-application audit log.

It seeds no production range weights, contribution weights, or Final KPI weights. The guarded down migration refuses teardown after unified business/audit data exists.

## Local evidence

- Framework baseline: Next.js `16.2.10`, React `19.2.4`.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 44/44 passed, including the 115-row/16-missing-type fixture.
- `npm run build`: passed with the unified route graph.
- `npm run test:e2e`: 3/3 passed for login rendering, anonymous authorization isolation, and legacy write endpoint locks.
- Production agent browser: 193 characters of meaningful content, zero Next.js error overlays, zero captured console errors, and no Admin/Member links exposed before authentication.
- `npm audit --omit=dev`: zero high/critical findings; five moderate `uuid` findings remain through `next-auth`/`googleapis`. The offered forced fix downgrades `next-auth` across a breaking major and was not applied.

## Reconciliation status

No live Sheet, Neon migration, or backfill was run in this implementation. The existing historical 145-row reconciliation remains reference evidence only. A fresh staging preview and explicit Admin approval are required before canonical event commit.

## Known limitations / approvals

- Production lifecycle mappings, project range weights, member-project contributions, KPI Template weights, thresholds, targets, and reopen authority remain intentionally unseeded.
- Real GSC refresh and parallel-month payroll comparison require staging credentials and business approval.
- UI smoke coverage is anonymous/local. Authenticated Admin/Member end-to-end workflows require test identities in staging.

## Rollback

Set `UNIFIED_APP_ENABLED=false`. Keep the additive tables and locked/audit rows. Use the guarded down migration only if every new unified table is still empty.
