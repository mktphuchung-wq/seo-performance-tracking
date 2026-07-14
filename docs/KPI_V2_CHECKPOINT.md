# Monthly KPI v2 staging checkpoint

Recorded on 2026-07-14 for branch `codex/monthly-kpi-v2-completion`.

Monthly KPI v2 remains a staging/shadow feature. Nothing in this checkpoint authorizes production payroll writes.

## 1. Implemented end-to-end surface

- Admin UI supports reconciliation, approved event persistence, Member × Month targets, URL Quality review, lifecycle Performance refresh, dynamic manual components, preview calculation, shadow lock/reopen, Sheet-difference evidence, PM/Finance approval evidence, and audit JSON export.
- Member UI is read-only and resolves the signed-in member rather than accepting another member from the query string.
- APIs use structured validation, request IDs, idempotency records, workflow state, and immutable locked snapshots.
- Missing database scores remain `null`; `system_error` Performance cannot be acknowledged into payroll.
- Quality payroll aggregation is the equal average of approved events. Event-unit weighting is retained only as an audit diagnostic.
- The Hướng Dương fixture `100/80/100/90` produces exactly `88%` and `2,640,000 VND`.

## 2. Staging database and source evidence

- Neon project: `proud-wildflower-67617170`.
- Staging branch: `br-patient-field-aodwm57c` (`kpi-v2-staging-20260714`), non-primary and ready.
- Primary branch `br-noisy-firefly-aof6m59n` was not migrated or written by this completion run.
- The additive completion migration was applied and rerun successfully on staging.
- Latest real-source sync produced 147 raw rows, 135 logical items, 100 canonical events, 35 quarantined items, and 12 duplicate variants. Quarantined values remain explicit rather than guessed.
- All 100 `slack_list_sheet` canonical events have `approved_by`, `approved_at`, and an approval reason recorded after the user's staging approval.
- July Member × Month targets are Hướng Dương 22, Như Tuyền 14, and Yến Phương 14 units.

## 3. Current real-data shadow calculation

| Member | Countable July events | Actual units | Target | Quantity | SEO Content | Performance | Final |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Hướng Dương | 3 | 1.5 | 22 | 6.818% | `null`, Quality coverage 0% | `null`, insufficient data | Incomplete |
| Như Tuyền | 4 | 4 | 14 | 28.571% | `null`, Quality coverage 0% | `null`, insufficient data | Incomplete |
| Yến Phương | 1 | 1 | 14 | 7.143% | `null`, Quality coverage 0% | `null`, insufficient data | Incomplete |

The calculation is runnable from reconciled real data, but a payable shadow result is intentionally blocked. There are currently no URL Quality reviews, mature Performance results, or approved manual Discipline/Social Video scores.

Both July projects (`Stories of Polynesian Pride` and `Tartan Vibes Clothing`) still have `performance_enabled_for_payroll=false` and no `project_start_date`. A PM must supply/approve lifecycle settings before mature GSC measurement or a justified N/A acknowledgement can exist.

## 4. Missing-Performance guard

Staging contains three `seo_performance` component rows for the three members:

- `payable_pct is null`: 3
- `status = insufficient_data`: 3
- missing/insufficient/system-error rows incorrectly stored as zero: 0

This verifies the required null-versus-zero behavior on both tests and persisted staging data.

## 5. Verification results

| Check | Result |
| --- | --- |
| `npm test` | Passed, 52/52 |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, 40 generated pages/routes |
| `npm run test:e2e` | Passed, 2/2 |
| `git diff --check` | Passed |
| Local browser verification | Content rendered; no Next.js overlay; no console errors |
| Vercel preview build | Ready |
| Vercel runtime boundary | Auth providers 200; unauthenticated admin 307; unauthenticated admin health 403 |
| Authenticated preview UI | Passed after stable callback registration; Google work account reached all three Monthly KPI v2 member views |
| Vercel error logs after smoke requests | No error entries |

Preview deployment:

- ID: `dpl_HY24ojZvwsqPaZadcQN1HCQGdvMc`
- Build URL: <https://seo-performance-tracking-2lvcfse77-hung-s-projects17xx.vercel.app>
- Stable Preview alias: <https://seo-performance-tracking-mktphuchung-8338-hung-s-projects17xx.vercel.app>
- Target: Preview only
- Preview `DATABASE_URL`: Neon staging branch
- Preview `KPI_ENGINE_V2_ENABLED`: `true`
- Preview `KPI_V2_PRODUCTION_WRITE_ENABLED`: `false`
- Preview `NEXTAUTH_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL`: stable Preview alias

The preview is protected by Vercel and application authentication. The stable callback below was registered in Google Cloud on 2026-07-14. After propagation, the user's authorized Google work account completed OAuth and reached the application dashboard and Monthly KPI v2 workspace:

```text
https://seo-performance-tracking-mktphuchung-8338-hung-s-projects17xx.vercel.app/api/auth/callback/google
```

The authenticated UI showed the reconciled July member set and real shadow calculations: Hướng Dương `1.5 / 22.00` and `6.8%`, Như Tuyền `4 / 14.00` and `28.6%`, and Yến Phương `1 / 14.00` and `7.1%`. All three showed Quality as `N/A · 0.0%`, Performance as `N/A · insufficient_data`, and Final/Payout as `N/A · N/A`. The workflow controls, source rows, targets, Performance cohort area, Sheet-difference evidence, PM approval, and Finance approval controls rendered without an application console error.

The three Google Sheets baselines have been read and mapped by exact workbook/tab/cell in `docs/KPI_V2_GOOGLE_SHEETS_BASELINE.md`. Twelve component baselines are also persisted as idempotent staging audit records. This documents stale prose conflicts in the Hướng Dương workbook. Numeric difference rows remain pending because the corresponding real v2 components are still `null` or awaiting reviewer approval.

## 6. Remaining acceptance gates

The following are real evidence/configuration gaps, not calculator implementation gaps:

1. Review every eligible URL for all three members until Quality coverage is 100%, including evidence or a justified exclusion.
2. Set and approve project lifecycle/GSC settings, then refresh mature Performance; alternatively record a valid PM N/A acknowledgement. System errors can never be acknowledged.
3. Enter and approve Discipline and Social Video component scores.
4. Use the captured Google Sheets baseline for every component. Every non-zero delta must include the exact Sheet range plus a source URL or rule version and explanation.
5. Confirm comparison coverage is complete and unexplained delta count is zero. Zero difference records do not count as completed comparison evidence.
6. Calculate, lock, reload, and export each member's shadow snapshot.
7. Record named PM and Finance approvals in the application. The user's general staging approval is not represented as either role signature.

## 7. Production status and rollback

Production payroll remains blocked. Do not set `KPI_V2_PRODUCTION_WRITE_ENABLED=true`, deploy with `--prod`, promote this preview, or copy shadow results to payroll until every gate in `KPI_V2_SHADOW_ACCEPTANCE.md` is complete.

Operational rollback is feature-flag disablement: set `KPI_ENGINE_V2_ENABLED=false` in Preview and retain staging tables/snapshots for audit. Do not delete locked snapshots or rewrite history.
