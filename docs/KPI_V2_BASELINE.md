# KPI Engine v2 Safety Baseline (Historical / Read-only Shadow)

This document is retained for migration audit only. New implementation work belongs to the unified application and must not extend this scaffold in parallel.

Recorded on 2026-07-14 before implementation changes on branch `feat/monthly-kpi-engine-v2`.

## Local checks

| Check | Baseline result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed, 9 tests |
| `npm run build` | Passed, 37 routes |

## Neon primary read-only diagnostic

No row contents were fetched and no writes were performed. Approximate planner row counts were:

| Relation | Approximate rows |
| --- | ---: |
| `content_urls` | 139 |
| `member_performance_cache` | 45 |
| `project_kpi_settings` | 0 |
| `refresh_runs` | 98 |
| `seo_performance_cache` | 524 |
| `sync_runs` | 0 |
| `url_work_events` | 0 |

The primary branch did not yet contain the Phase 3 monthly KPI tables. Staging setup must therefore apply `20260710_monthly_kpi.sql` before `20260714_monthly_kpi_engine_v2.sql`.

## Staging boundary

A Neon branch named `kpi-v2-staging-20260714` was initially blocked by the branch quota. After a slot was freed, staging branch `br-patient-field-aodwm57c` was created from primary and both required migrations were applied there. Primary was never migrated.

No production migration, Sheet mutation, GSC backfill, payroll backfill, or Vercel production deployment was performed.
