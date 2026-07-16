# Unified SEO KPI Remediation Checkpoint

Recorded on 2026-07-15 for `codex/unified-seo-kpi-remediation` from reviewed baseline `1322e4923d8bc07bbff2715a9ef345b92470dc49`.

## Implemented contract

- `Performance SEO database/content_urls` is the normal read-only source, with the exact `project | url | member_name | date | type` header contract.
- Source Preview persists raw lineage and diff evidence without changing Canonical URLs or Work events. Commit requires a reviewed Preview ID, reason, and idempotency key.
- Existing events are matched by Project + canonical URL + Member + Date + Type. Legacy-only records become inactive for Unified KPI only after a complete successful commit.
- Project Settings uses synced/configured options, automatic domain detection, accessible GSC properties, and derived readiness. The new workflow has no contribution-weight control, write path, or rollup query.
- Source, GSC, and Performance freshness are independently reported. Actual GSC state/date is separate from GSC eligibility.
- Performance range lineage comes from persisted diagnostics rather than the nonexistent monthly result `source_ids` column. Member rollup uses eligible work units and blocks on system errors.
- Member Review is Month -> Member -> URLs and stores a Member x Month target.
- KPI Close stores versioned Member x Month component weights. Social + Video is optional and must have 0% weight when disabled. Locked targets/config/results are immutable; reopen creates a new version.
- Canonical APIs return structured errors and request IDs. Legacy tables and historical locked snapshots remain intact.

## Preview isolation

- Neon project: `proud-wildflower-67617170`.
- Preview branch: `br-divine-waterfall-ao40vivd` (`preview/codex/unified-seo-kpi-app`).
- Primary branch was not migrated or written.
- Remediation migration was applied twice on the Preview branch. Both runs succeeded.
- Business counts stayed at 139 Canonical URL rows and 107 Work event rows immediately after migration.
- Duplicate checks before migration found zero duplicate Canonical URL identity groups and zero duplicate Work event identity groups.

## Live source evidence

Read-only Google Sheets inspection found the exact five headers and 112 non-empty rows at the time of validation. The count is evidence from that snapshot, not an application constant. The Sheet was never mutated.

## Verification status

- Local quality gates passed on the remediation branch: `npm run typecheck`, `npm run lint`, `npm test` (50/50), `npm run build`, `npm run test:e2e` (3 passed, 2 Preview-credential tests skipped locally), and `git diff --check`.
- Protected Vercel Preview: `https://seo-performance-tracking-ghz1sjbj5-hung-s-projects17xx.vercel.app`, deployed from commit `3d4a671` before the final test-harness-only commit.
- The deployment is `READY`; `/api/health/db` and `/api/health/cache` both return `ok: true`. The schema check reports no missing tables, views, columns, or migration warnings.
- Authenticated Playwright against the protected Preview passed 5/5 scenarios in 41.1 seconds using Vercel's automation bypass plus Preview-only test auth. Coverage includes public/anonymous behavior, legacy write locks, all six Admin pages, six canonical Admin GET APIs, all three Member pages, Member redirect behavior, and a Member `403` on an Admin API.
- Vercel log queries for HTTP 500 and error-level events in the acceptance window returned no events.
- Runtime cache evidence on the isolated Preview reports 139 Canonical URL rows, 107 Work events, a successful 109-row source sync snapshot, and successful current-month/previous-month/3M/all-time Performance refresh history. The explicit 6M `not_enough_data` state remains non-zero and is not coerced to a score.
- Google Sheets was inspected read-only through the connected account and currently contains 112 non-empty rows with the exact five-header contract. The app-level Source Preview/Commit and a new GSC refresh were not triggered in this run because the isolated Preview does not have a real Google OAuth session/token. No source, target, KPI configuration, review, finalization, or reopen business write was manufactured to bypass that authorization boundary.
- The last item is an operator-acceptance limitation rather than an implementation bypass: an authorized Admin must exercise the Google-dependent buttons in Preview before approving merge. Production writes remain disabled and the primary Neon branch remains untouched.

## Rollback

- Disable `UNIFIED_APP_ENABLED` to stop Unified writes while retaining all audit history.
- `migrations/20260715_unified_remediation_down.sql` refuses teardown once remediation business/lineage data exists.
- Never delete legacy review data, locked snapshots, or audit logs. Never point Preview at the primary Neon branch.
