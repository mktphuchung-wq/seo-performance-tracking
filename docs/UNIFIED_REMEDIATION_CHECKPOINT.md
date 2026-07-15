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

Update this section after the final commit and Preview deployment with exact command results, deployment URL/SHA, authenticated browser evidence, runtime Source/GSC/Performance evidence, and any remaining limitations.

## Rollback

- Disable `UNIFIED_APP_ENABLED` to stop Unified writes while retaining all audit history.
- `migrations/20260715_unified_remediation_down.sql` refuses teardown once remediation business/lineage data exists.
- Never delete legacy review data, locked snapshots, or audit logs. Never point Preview at the primary Neon branch.
