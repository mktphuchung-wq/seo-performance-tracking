# Unified Application Staging Runbook

## 1. Prepare staging

1. Create or select a Neon staging branch and a staging Vercel deployment.
2. Set staging-only credentials and `UNIFIED_APP_ENABLED=true`.
3. Keep `UNIFIED_PRODUCTION_WRITE_ENABLED=false` everywhere.
4. Record schema health and row-count diagnostics without logging connection strings or OAuth tokens.

## 2. Apply migration

```bash
VERCEL_ENV=preview DATABASE_URL="$STAGING_DATABASE_URL" npm run db:migrate:unified -- --apply --verify-idempotent --acknowledge-staging
```

The runner applies the Phase 3, KPI v2, and unified migrations in order. The second application proves full-chain idempotency, verifies required tables/columns, and rejects changes to URL/work-event row counts. Verify `/api/health/db` and `/api/health/cache` before continuing.

## 3. Configure before scoring

In `/admin/projects`, create approved effective versions for:

- canonical domain and lifecycle;
- GSC property/readiness and KPI readiness;
- 3M/6M/All Time weights totaling 100%;
- member-project contribution weights totaling 100% per member/month.

In `/admin/kpi-close`, approve one three-component KPI Template totaling 100%. Do not invent or prefill production weights.

## 4. Reconcile source

1. Run Preview in `/admin/sync`.
2. Review raw rows, logical items, duplicate variants, domain classification, drafts, and quarantine.
3. Resolve every unknown project/member/type/status/date needed for payroll.
4. Record Admin approval reason, then Commit accepted rows.
5. Rerun the same commit and verify source item IDs update rather than duplicate.

Do not edit the Google Sheet from this application.

## 5. Run the monthly workflow

1. Set member/project target units in `/admin/member-review`.
2. Approve every eligible URL quality review with notes/evidence where required.
3. Refresh `/admin/member-performance`; inspect 3M/6M/All Time coverage, confidence, lineage, and N/A reasons.
4. Calculate KPI preview.
5. Enter Social + Video score/evidence or explicit N/A reason.
6. Export audit JSON, then finalize and lock only after controllable components are complete.
7. Probe that the locked row rejects mutation; test reopen with an authorized reason and confirm a new version.

## 6. Reconciliation and sign-off

Compare one complete month for every lifecycle against the read-only legacy/spreadsheet result. Explain every difference. PM/Finance must approve aliases, event counts, targets, range/contribution/template weights, missing-Performance acknowledgements, and payout output before production use.

## 7. Rollback

- Before unified data exists: run `migrations/20260715_unified_application_down.sql`.
- After data exists: set `UNIFIED_APP_ENABLED=false`; retain all unified and locked/audit data.
- Never run the destructive baseline, delete locked snapshots, or rewrite an approved historical month.
