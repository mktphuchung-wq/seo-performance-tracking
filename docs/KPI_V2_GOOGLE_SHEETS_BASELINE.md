# Monthly KPI v2 Google Sheets baseline

Read-only evidence captured on 2026-07-14. No Google Sheet cells were changed.

The executable baseline is the 07/2026 demo table in each member workbook. Values below are `effectiveValue` from Google Sheets, not values copied from prose.

## Component baselines

| Member | Workbook and exact range | Discipline | SEO Content | SEO Performance | Social / Video | Sheet payout |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Hướng Dương | [KPI_Hướng Dương](https://docs.google.com/spreadsheets/d/1tRWqRjzHaR0nlmpMqAhPlFlk8sQFTBa7f2VI3YyvCt4) — `demo 07/2026!A1:C7` | 100% (`B3`) | 80% (`B5`, labelled Audit Content) | 100% (`B6`, labelled Audit Performance) | 90% (`B4`) | 2,640,000 VND (`B7`) |
| Như Tuyền | [KPI_Như Tuyền](https://docs.google.com/spreadsheets/d/1B1CXdpA52w_g9sVIDeTVGzq58JxuylCgM0ltdaya0s4) — `Demo 07/2026!A1:C7` | 100% (`B3`) | 90% (`B4`) | 70% (`B5`) | 100% (`B6`) | 2,670,000 VND (`B7`) |
| Yến Phương | [KPI_Yến Phương](https://docs.google.com/spreadsheets/d/1NtXaw0WsNI_Yey25gA9tyPd8z5eoE_GqvdjVtu0_hvU) — `Demo 07/2026!A1:C7` | 100% (`B3`) | 80% (`B4`, labelled SEO) | 100% (`B5`) | 100% (`B6`) | 2,700,000 VND (`B7`) |

Each payout cell uses the same executable formula pattern:

```text
=$C$2*SUMPRODUCT(B3:B6,C3:C6)
```

The base is 3,000,000 VND and the weights in column C total 100%.

## Rule and label reconciliation

The Sheet row order and labels are not identical across members, so the comparison must map by component meaning rather than row number:

- `Thái độ & Kỷ luật` → `discipline`
- `SEO Content`, `SEO`, or `Audit Content` → `seo_content`
- `SEO Performance` or `Audit Performance` → `seo_performance`
- `Social Content + Video` → `social_video`

This mapping is the rule-lineage explanation for row-order and label differences. It does not authorize copying a Sheet score into v2 without the required v2 evidence.

## Source inconsistencies requiring explicit treatment

### Hướng Dương

`Hướng dẫn!A10:A15` conflicts with the executable demo table:

- prose says Audit Content 90%, Audit Performance 80%, and Social 100%;
- its formula text uses Performance 70% and Social 90%;
- the same prose line states payout 2,640,000 VND, although the displayed text inputs do not calculate to that payout;
- `demo 07/2026!B3:B7` consistently contains `100/90/80/100` in its sheet-specific row order and calculates 2,640,000 VND, which maps to v2 components `100/80/100/90`.

Therefore the executable demo cells, not the stale prose, are the accepted fixture baseline. This is a Sheet rule/text inconsistency, not a v2 calculation delta.

### Như Tuyền and Yến Phương

Both workbooks have `Demo 07/2026` tables, while parts of `Hướng dẫn!A9:A15` still call the prose example June 2026. The component values and executable payout formulas agree with the demo tables; the month wording is stale documentation.

## Comparison status

The baseline is now identified with workbook URL, tab, cell, value, label mapping, and known Sheet inconsistencies. Persisted v2 component values are not yet available for a complete comparison:

- `seo_content` is `null` until URL Quality coverage reaches 100%;
- `seo_performance` is `null` until lifecycle/GSC evidence exists or PM acknowledges a valid N/A;
- `discipline` and `social_video` still require named reviewer approval.

Do not convert these nulls to zero and do not create a numeric delta yet. After v2 components are approved, record one comparison row per component in the UI. Every non-zero delta must reference this Sheet range plus the affected URL or v2 rule version and a concise explanation. Comparison coverage must be complete before `unexplained differences = 0` can pass.
