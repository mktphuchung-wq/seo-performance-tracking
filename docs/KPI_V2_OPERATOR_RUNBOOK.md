# Monthly KPI v2 operator runbook

Monthly KPI v2 is a staging/shadow workflow. It must not be used for production payroll until the three-member shadow comparison has zero unexplained differences and PM/Finance have approved the evidence.

## Before opening the month

- Confirm the preview deployment is bound to the dedicated Neon staging branch.
- Confirm `KPI_ENGINE_V2_ENABLED=true` only on Preview and `KPI_V2_PRODUCTION_WRITE_ENABLED=false` everywhere.
- Confirm Preview uses a stable `NEXTAUTH_URL` and that Google OAuth authorizes the exact `/api/auth/callback/google` URI before beginning the UI workflow.
- Confirm the admin Google account can read the Slack List Sheet and mapped GSC properties.
- Configure `MEMBER_EMAIL_MAP` and `PROJECT_GSC_MAP`; never put tokens or database URLs in evidence exports.

## Monthly UI workflow

1. Open `/admin/kpi-month`, choose `YYYY-MM`, and select the member.
2. Click **Dry-run reconciliation**. Review raw, logical, canonical, duplicate and quarantine counts. A database/query failure appears as an actionable error with a request ID; it is never shown as an empty month.
3. Resolve every quarantine or explicitly leave it outside payroll. Click **Persist raw evidence**, then **Persist approved events** with the reconciliation approval reason. Raw variants remain auditable; only one canonical Slack event is payable.
4. Save the canonical Member × Month target. July 2026 source-of-truth targets are Hướng Dương 22, Như Tuyền 14, and Yến Phương 14 units. Project allocations are optional and must total the member target.
5. Review every countable URL work event. Use the work-type rubric, attach evidence, and approve or exclude with a reason. Final requires 100% resolved event coverage. Payroll Quality is the equal-event average.
6. In **Project lifecycle & Performance settings**, confirm strategy, project start, pre/lag/post windows, GSC delay, reliability thresholds, controls and shadow payroll enablement. Refresh only mature cohorts. N/A stays null; mapping/permission/provider failures become `system_error` and block Final.
7. Enter the active manual component scores. Calculate preview and inspect raw/payable/coverage/confidence/source/rule fields, Final %, and payout.
8. Finalize to create an immutable, `shadow_only` snapshot. Reload must be read-only. Reopen only when authorized; provide a reason and create a new version.
9. Enter the Google Sheets comparison for each component. Every non-zero delta needs its active rule, explanation, and affected URL when URL-specific. Save evidence, verify zero unexplained rows, then let PM and Finance record their own approvals.
10. Export the audit JSON and retain it with the review decision. Do not write results back to Google Sheets.

## Stop conditions

Do not finalize or approve when any of these is true:

- source aliases/quarantines are unresolved for a claimed payable item;
- target is missing, project allocations do not total the member target, or Quality coverage is below 100%;
- Performance is `system_error` or `pm_review_required`;
- a required controllable component is missing;
- a Google Sheets delta is unexplained or lacks URL/rule lineage.

A valid lifecycle/readiness `not_applicable` or `insufficient_data` Performance result may be acknowledged by PM and excluded through weight renormalization. A system error may never be acknowledged away.

## Evidence packet

For each of Hướng Dương, Như Tuyền and Yến Phương retain:

- reconciliation run ID, counts, quarantine disposition and event approval reason;
- target and optional allocations;
- canonical event list with source item, URL, units, unit rule and Quality review;
- Performance work month, measurement month, mature units, GSC cutoff, availability, rule and control diagnostics;
- component and Final calculation run IDs, locked version and payout;
- Sheet/v2/delta rows with URL/rule explanation;
- PM and Finance approver, timestamp, note and evidence snapshot.

## Rollback

Set `KPI_ENGINE_V2_ENABLED=false`, keep all v2 tables/snapshots read-only, and return operators to the legacy view. Never delete locked results or rewrite history. The guarded down migration is only for an unused staging schema with no business/audit data.
