# Unified Application Staging Runbook

## 1. Prepare Preview/staging

1. Create or select a Neon non-primary branch and Vercel Preview deployment.
2. Set Preview-only credentials and `UNIFIED_APP_ENABLED=true`.
3. Keep `UNIFIED_PRODUCTION_WRITE_ENABLED=false` everywhere.
4. Confirm `DATABASE_URL` resolves to the intended non-primary Neon branch.
5. Record schema health and business counts without logging connection strings or OAuth tokens.

## 2. Apply migration

```bash
VERCEL_ENV=preview DATABASE_URL="$STAGING_DATABASE_URL" npm run db:migrate:unified -- --apply --verify-idempotent --acknowledge-staging
```

The runner applies the Phase 3, KPI v2, unified, and remediation migrations in order. The second pass proves full-chain idempotency, verifies required tables/columns, and rejects changes to Canonical URL/Work event row counts. Verify `/api/health/db` and `/api/health/cache`.

## 3. Configure projects before scoring

In `/admin/projects`, select each known project and approve effective settings for:

- automatically detected canonical domain;
- lifecycle;
- accessible GSC property;
- 3M/6M/All Time weights totaling 100%.

No member-project contribution configuration is required.

## 4. Reconcile source

1. Run `Check for source changes` in `/admin/sync`.
2. Review Source rows, valid work records, canonical URLs/events, legacy matches, diff counts, duplicate variants, and needs-attention rows.
3. Resolve any identity/type/date/URL issues required for payroll.
4. Record an Admin approval reason and apply the reviewed Preview run.
5. Retry with the same idempotency key and verify the committed result is returned without duplicate events.
6. Confirm legacy-only records are inactive for Unified KPI only after the complete successful commit.

The application never writes back to Google Sheets.

## 5. Run the monthly workflow

1. Save Member x Month target units in `/admin/member-review`.
2. Approve every eligible URL quality review with evidence where required.
3. Refresh `/admin/member-performance`; inspect 3M/6M/All Time coverage, confidence, lineage, data-through date, and N/A reasons.
4. In `/admin/kpi-close`, approve three-component weights for each Member x Month. Applied weights must total 100%; disabled Social + Video must be 0%.
5. Calculate the selected member preview.
6. Enter Social + Video evidence only when enabled, or keep it disabled/N/A.
7. Export audit JSON and finalize only after controllable components are complete.
8. Probe that locked target/config/result rows reject mutation. Reopen with an authorized reason and confirm a new version.

## 6. Reconciliation and sign-off

Compare one complete month for every lifecycle with the read-only legacy result. Explain every difference. PM/Finance must approve aliases, event counts, targets, range weights, per-member Final KPI weights, missing-Performance acknowledgements, and payout output before production use.

## 7. Preview-only automated auth

Automated authenticated browser checks require all of:

```text
VERCEL_ENV=preview
E2E_TEST_AUTH_ENABLED=true
E2E_TEST_AUTH_SECRET=<Preview secret, at least 24 characters>
E2E_TEST_ADMIN_EMAIL=<whitelisted Preview Admin>
E2E_TEST_MEMBER_EMAIL=<whitelisted Preview Member>
```

The provider is absent unless all guards pass and is rejected when `VERCEL_ENV` is not `preview`. Never store these values in production.

## 8. Rollback

- Set `UNIFIED_APP_ENABLED=false` and retain audit history.
- Use down migrations only while their guarded tables/lineage remain empty.
- Never run the destructive baseline, delete locked snapshots, or rewrite an approved historical month.
