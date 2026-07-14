# Monthly KPI v2 shadow acceptance record

Use this record alongside the audit JSON. Approval means the evidence is sufficient to decide on a later production rollout; it does not itself enable production payroll.

| Gate | Hướng Dương | Như Tuyền | Yến Phương |
| --- | --- | --- | --- |
| Real source reconciliation approved | Approved for staging | Approved for staging | Approved for staging |
| Canonical events available from reconciled scope | Verified | Verified | Verified |
| Target saved (22/14/14) | Verified: 22 | Verified: 14 | Verified: 14 |
| Authenticated Preview UI renders real shadow state | Verified | Verified | Verified |
| Quality coverage 100% | Pending | Pending | Pending |
| Mature Performance or valid PM-acknowledged N/A | Pending | Pending | Pending |
| Missing Performance never stored as zero | Verified: `null` | Verified: `null` | Verified: `null` |
| Sheet component differences recorded | Pending | Pending | Pending |
| Unexplained differences = 0 after complete comparison | Pending (no comparison rows) | Pending (no comparison rows) | Pending (no comparison rows) |
| Shadow result locked and reload verified | Pending | Pending | Pending |
| PM approval recorded | Pending | Pending | Pending |
| Finance approval recorded | Pending | Pending | Pending |

Fixture acceptance is separate and verified by automated tests: Hướng Dương components `100/80/100/90` produce exactly `88%` and `2,640,000 VND`.

Production rollout remains blocked until every pending real-data row above is complete and authorized PM/Finance reviewers approve the packet. The authenticated Preview deployment has been verified against staging.

Google Sheets baselines are grounded in `KPI_V2_GOOGLE_SHEETS_BASELINE.md`; this does not mark comparison complete while v2 values remain unavailable.
