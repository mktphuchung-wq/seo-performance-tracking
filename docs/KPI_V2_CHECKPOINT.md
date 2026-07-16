# KPI Engine v2 Implementation Checkpoint (Historical / Read-only Shadow)

This checkpoint is retained as evidence. The active architecture is documented in `UNIFIED_APPLICATION_CHECKPOINT.md`.

Recorded on 2026-07-14 for branch `feat/monthly-kpi-engine-v2`.

## 1. Files changed

- Added normalized Slack List and legacy Sheet ingestion, alias resolution, deterministic work-item reconciliation, quarantine diagnostics, and transactional persistence.
- Added Quantity, Quality, SEO Content, lifecycle Performance, member/project rollup, final KPI, payout, and month-locking domain services.
- Added KPI v2 repositories, admin/member APIs, admin pages, settings, health checks, reconciliation CLI, tests, and rollout documentation.
- Updated feature-gated configuration, Google Sheet/GSC readers, navigation, and legacy sync safety.

## 2. Migration and schema impact

- `migrations/20260714_monthly_kpi_engine_v2.sql` is additive and idempotent.
- It adds identity/alias/raw-source, versioned unit/rubric, GSC daily/evaluation, project/member result, component, override, and audit objects.
- It extends work-event, target, criterion, quality-score, and project lifecycle settings without deleting historical columns.
- `migrations/20260714_monthly_kpi_engine_v2_down.sql` permits teardown only before business or audit data exists. Operational rollback after data exists is feature-flag disablement, not deletion.
- Neon staging branch `br-patient-field-aodwm57c` (`kpi-v2-staging-20260714`) was created from primary. The prerequisite and v2 migrations applied successfully, and the complete v2 migration reapplied successfully to prove idempotency.
- Application-level schema health returned `ok=true`, with no missing tables, views, columns, or migration warnings. The locked-snapshot mutation probe was rejected and its transaction rolled back.
- No migration was applied to Neon primary and no production data was read beyond schema/approximate-count diagnostics.

## 3. Tests and results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed, 36/36 |
| `npm run build` | Passed, 40 routes/pages |
| `git diff --check` | Passed |
| Vercel staging preview build | Ready |

The test suite covers headerless/header-present ingestion, aliases, duplicate variants, draft exclusion, status mapping, unit precedence, Quantity null/cap behavior, Quality 0-5/N/A and coverage, lifecycle Performance reliability/no-floor behavior, target-weighted rollups, final coverage/payout, locking/reopen, and the end-to-end monthly pipeline with fixtures.

## 4. Reconciliation output

The live read-only reconciliation of `SEO Content - Konic`, `Data!A1:K300`, produced:

| Diagnostic | Count |
| --- | ---: |
| Raw rows | 145 |
| Logical items | 133 |
| Canonical completed events | 94 |
| Quarantined items | 33 |
| Duplicate variants | 12 |
| Duplicate Slack IDs | 10 |
| Project alias merges | 56 |
| Draft variants excluded | 8 |

The legacy `content_urls` source is headerless and its first row was retained: 109 rows, 108 unique canonical URLs, one duplicate URL row, and two blank work types. Of 113 completed public Slack URLs, 103 overlap legacy, 10 are Slack-only, and five are legacy-only.

The staging repository probe persisted the same duplicate/draft/live fixture twice. The second run updated the same two stable source events instead of duplicating them; the audit resolved to `0.50` under `unit_v2`, and `Checked` stayed non-countable. All probe rows were then deleted and verified absent.

## 5. Known limitations and approval blocker

- The live quarantine contains 28 blank work types, three unresolved projects (two blank and one `Wonder`), two blank members, two blank statuses, four missing completion dates, and URL issues. These remain null/quarantined and were not guessed.
- The Slack List is a separate spreadsheet from legacy `content_urls`; `GOOGLE_SLACK_LIST_SHEET_ID` and live Vietnamese header aliases were added after staging discovery.
- Real source rows have not been persisted. The endpoint now defaults to raw-only staging; canonical event persistence requires `stage=events` plus an explicit approval reason.
- GSC staging refresh, lifecycle configuration, July targets/reviews/manual components, parallel-month payout comparison, and payroll lock remain pending business decisions.
- Vercel deployment `dpl_3TxKaDJTSW6HXF1b7hrUXX3H1HCQ` is ready and was created with staging-scoped variables. Deployment Protection prevented an independent HTTP runtime-health read, so the preview-to-branch binding remains unconfirmed even though the branch and application health check were verified directly.

## 6. Rollback method

Before staging business data exists, run the guarded v2 down migration. After data exists, set `KPI_ENGINE_V2_ENABLED=false`, keep the v2 tables for audit, and use the legacy read-only views. Never delete locked snapshots or rewrite approved months.

## 7. Approval needed before continuation

Approve or correct the source reconciliation before any real write: resolve the quarantine categories, confirm the `Wonder` project disposition, approve canonical event counts and aliases, and provide an approval reason for event creation. Then confirm lifecycle mappings, July member/project targets, impression thresholds, manual component rubrics, and lock/reopen authority before the shadow payout run.

Preview: <https://seo-performance-tracking-m3ua8gg03-hung-s-projects17xx.vercel.app>
