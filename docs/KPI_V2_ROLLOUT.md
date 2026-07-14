# KPI Engine v2 Staging and Rollout

## Feature gates

- `KPI_ENGINE_V2_ENABLED=false` is the default.
- V2 write APIs reject production writes unless `KPI_V2_PRODUCTION_WRITE_ENABLED=true` is explicitly set after staging sign-off.
- Legacy dashboards remain available and v2 does not consume legacy project floors.

## Staging migration order

Use a dedicated Neon branch. Never run `migrations/001_simple_cache_schema.sql` on an existing database.

```bash
psql "$STAGING_DATABASE_URL" -f migrations/20260710_monthly_kpi.sql
psql "$STAGING_DATABASE_URL" -f migrations/20260714_monthly_kpi_engine_v2.sql
psql "$STAGING_DATABASE_URL" -f migrations/20260714_monthly_kpi_v2_completion.sql
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

Set the preview deployment's `DATABASE_URL` to the staging branch and enable `KPI_ENGINE_V2_ENABLED=true` only there. Keep `KPI_V2_PRODUCTION_WRITE_ENABLED` unset.

## Reconciliation

The source dry run is `POST /api/admin/kpi-month/:month/sync?dryRun=true`. It reads the Slack List `Data` tab, preserves all raw variants in memory, and returns canonical counts without writing. Configure `GOOGLE_SLACK_LIST_SHEET_ID` separately from the legacy `GOOGLE_SHEET_ID` when they are different spreadsheets. A local fixture can be checked with:

```bash
npm run kpi:reconcile
```

To inspect an authorized JSON export locally without saving it to the repository:

```bash
npm run kpi:reconcile -- C:\secure\slack-list-values.json
```

For connector-driven staging automation, the same script accepts a transient `KPI_RECONCILE_VALUES_JSON` environment snapshot. Set `KPI_RECONCILE_PERSIST_MODE=raw` for the mandatory raw-only pass. Event mode additionally requires `KPI_RECONCILE_APPROVAL_REASON`; never persist source exports to the repository.

Review aliases, completion dates, targets, canonical event counts, and quarantines before calling the write sync. July must run in shadow mode beside the spreadsheet and must not be used for payroll until PM/finance sign-off.

All monthly business actions are available in `/admin/kpi-month/:month`; operators do not need SQL or curl. The JSON endpoints remain an audited transport and export interface, not the operator UI.

Monthly Quality is the equal average of approved eligible work-event scores. Coverage is resolved eligible event count divided by total eligible event count. A unit-weighted score is retained only as a diagnostic and never drives payroll.

The first staging write must be raw-only: `POST .../sync?dryRun=false&stage=raw`. Canonical work events require the explicit `stage=events` mode and a non-empty URL-encoded `approvalReason`. Raw-only mode records every source variant and diagnostics but creates no work event.

## Rollback

Before v2 contains business data, the staging-only down migration removes new objects. Once v2 contains source, score, or audit data, the down migration refuses to run. Operational rollback is then:

1. Set `KPI_ENGINE_V2_ENABLED=false`.
2. Keep v2 tables read-only for audit.
3. Return operators to legacy views.
4. Do not delete v2 data or rewrite a locked month.

## Production approvals still required

- Project lifecycle mapping and payroll enablement.
- July member/project targets, including any prorations.
- Checked/admin-approval policy and audit difficulty authority.
- Project impression thresholds and seasonal workflow.
- Discipline and Social/Video rubrics.
- Finalization and reopen authorities.

## Shadow evidence gate

For each member, compare Discipline, SEO Content, SEO Performance, Social/Video and Final/payout against the Sheet. Save the Sheet value, v2 value, delta, active rule version, affected URL where applicable, and a concrete explanation. PM and Finance approval writes are rejected unless evidence exists and the unexplained count is zero. Export the member audit JSON for the decision packet; a locked result remains `shadow_only=true`.
