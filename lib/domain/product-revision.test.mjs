import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderMonthlyHtmlReport, escapeHtml } from "../reports/monthly-html-report.ts";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("monthly HTML report is self-contained, escaped, and preserves N/A", () => {
  const html = renderMonthlyHtmlReport({
    generatedAt: "2026-07-18T00:00:00.000Z", dataThrough: null,
    filters: { month: "2026-07", project: "<script>x</script>", member: null, options: { projects: [], members: [] } },
    summary: { eventCount: 1, urlCount: 1, payableWorkUnits: 1, approvedReviews: 0, pendingReviews: 1, fetchErrors: 0, observedZero: 0, missingData: 1, tooNewOrReview: 0 },
    freshness: {}, warnings: [{ code: "gsc_missing", count: 1, href: "/admin/data-source" }],
    projects: [], members: [{ member_name: "Lan & Co", url_count: 1, work_units: 1, performance_pct: null, performance_coverage: null, kpi_payable_pct: null, kpi_status: "draft", kpi_rule_version: null }],
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /@media print/);
  assert.match(html, /Lan &amp; Co/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /N\/A/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.equal(escapeHtml(`"<&'`), "&quot;&lt;&amp;&#039;");
});

test("current month remains diagnostic while final ranges stay 3m, 6m, all time", async () => {
  const source = await read("lib/services/performance-service.ts");
  assert.match(source, /const rangeKeys: RangeKey\[\] = \["3m", "6m", "all_time"\]/);
  assert.match(source, /'current_month'::text range_key/);
  assert.match(source, /currentMonth: projectRanges\.find/);
  assert.doesNotMatch(source, /const rangeKeys[^\n]*current_month/);
});

test("member URL workspace distinguishes reliability states and uses age-aware expected days", async () => {
  const source = await read("lib/repositories/data-source.ts");
  for (const state of ["fetch_error", "too_new", "missing", "observed_zero", "observed"]) assert.match(source, new RegExp(`'${state}'`));
  assert.match(source, /greatest\(date_trunc\('month',\$1::date\)::date,e\.work_date\)/);
  assert.match(source, /observed_days\*100\.0\/metrics\.expected_days/);
  assert.match(source, /limit \$\$\{params\.length \+ 1\} offset/);
});

test("Rule Registry migration and writes require version, effective date, approval metadata, and audit", async () => {
  const [migration, repository, route, runner] = await Promise.all([
    read("migrations/20260718_rule_registry.sql"), read("lib/repositories/rules.ts"), read("app/api/admin/rules/route.ts"), read("scripts/apply-unified-migration.mjs"),
  ]);
  for (const column of ["status", "reason", "approved_by", "approved_at", "effective_to", "created_by"]) assert.match(migration, new RegExp(`add column if not exists ${column}`));
  assert.match(repository, /application_audit_log/);
  assert.match(repository, /Quality criteria weights must total 100%/);
  assert.match(route, /session\.user\.isAdmin/);
  assert.match(route, /assertUnifiedWriteEnvironment/);
  assert.match(route, /assertUnifiedSchemaReady/);
  assert.match(runner, /20260718_rule_registry\.sql/);
});

test("Admin report route enforces admin authorization and safe download headers", async () => {
  const route = await read("app/api/admin/reports/monthly/route.ts");
  assert.match(route, /status: 403/);
  assert.match(route, /content-type": "text\/html; charset=utf-8/);
  assert.match(route, /content-disposition/);
  assert.match(route, /cache-control": "private, no-store/);
});
