import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePostgresConnectionString } from "../database-url.ts";
import {
  authorizePreviewTestIdentity,
  previewTestAuthConfig,
} from "../preview-test-auth.ts";
import { validateMemberKpiConfig } from "./member-kpi-config.ts";
import { gscPropertyCoversUrl, normalizeDomain, validateRangeWeights } from "./project-settings.ts";
import { reconcileWorkSourceRows } from "./work-source.ts";
import { rollupProjectsByEligibleWorkUnits } from "../kpi/work-unit-rollup.ts";
import { calculateFinalMonthlyKpi } from "../kpi/monthly-final.ts";
import { scoreBase } from "../kpi/types.ts";
import {
  aggregatePerformanceRange,
  combineAvailableScores,
} from "../performance/range-calculator.ts";
import {
  CONTENT_URLS_HEADERS,
  parseContentUrlsSheet,
} from "../sync/content-urls-sheet.ts";

test("Project Settings normalizes domains and requires complete range weights", () => {
  assert.equal(normalizeDomain("https://WWW.Example.com/path"), "example.com");
  assert.deepEqual(
    validateRangeWeights({ threeMonth: 70, sixMonth: 30, allTime: 0 }),
    { threeMonth: 70, sixMonth: 30, allTime: 0 },
  );
  assert.throws(
    () => validateRangeWeights({ threeMonth: 70, sixMonth: 20, allTime: 0 }),
    /100%/,
  );
});

test("Neon connection strings use verify-full without dropping channel binding", () => {
  const normalized = normalizePostgresConnectionString(
    "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  );
  const url = new URL(normalized);
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.get("channel_binding"), "require");
});

test("Preview test auth is impossible to enable in production and only accepts whitelisted identities", () => {
  const base = {
    E2E_TEST_AUTH_ENABLED: "true",
    E2E_TEST_AUTH_SECRET: "a-preview-only-secret-with-24-chars",
    E2E_TEST_ADMIN_EMAIL: "admin-preview@example.com",
    E2E_TEST_MEMBER_EMAIL: "member-preview@example.com",
  };
  assert.equal(
    previewTestAuthConfig({ ...base, VERCEL_ENV: "production" }),
    null,
  );
  assert.equal(
    authorizePreviewTestIdentity(
      "admin-preview@example.com",
      base.E2E_TEST_AUTH_SECRET,
      { ...base, VERCEL_ENV: "production" },
    ),
    null,
  );
  assert.equal(
    authorizePreviewTestIdentity(
      "unknown@example.com",
      base.E2E_TEST_AUTH_SECRET,
      { ...base, VERCEL_ENV: "preview" },
    ),
    null,
  );
  assert.equal(
    authorizePreviewTestIdentity("admin-preview@example.com", "wrong", {
      ...base,
      VERCEL_ENV: "preview",
    }),
    null,
  );
  assert.equal(
    authorizePreviewTestIdentity(
      "admin-preview@example.com",
      base.E2E_TEST_AUTH_SECRET,
      { ...base, VERCEL_ENV: "preview" },
    )?.role,
    "admin",
  );
});

test("content_urls adapter enforces the five-header contract and preserves Sheet row lineage", () => {
  assert.deepEqual(
    [...CONTENT_URLS_HEADERS],
    ["project", "url", "member_name", "date", "type"],
  );
  const rows = parseContentUrlsSheet([
    [...CONTENT_URLS_HEADERS],
    [
      "Print Your Wear",
      "https://example.com/first",
      "Thu Hang",
      46202,
      "New Post",
    ],
    ["", "", "", "", ""],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "content_urls_sheet");
  assert.equal(rows[0].sourceRowNumber, 2);
  assert.equal(rows[0].workDateRaw, 46202);
  assert.deepEqual(rows[0].payload, {
    project: "Print Your Wear",
    url: "https://example.com/first",
    member_name: "Thu Hang",
    date: 46202,
    type: "New Post",
  });
  assert.throws(
    () => parseContentUrlsSheet([["project", "url", "member_name", "date"]]),
    /exactly/i,
  );
  assert.throws(
    () => parseContentUrlsSheet([[...CONTENT_URLS_HEADERS, "unexpected"]]),
    /exactly/i,
  );
});

test("content_urls candidates count before persistence and malformed rows remain needs-attention", () => {
  const source = parseContentUrlsSheet([
    [...CONTENT_URLS_HEADERS],
    [
      "Print Your Wear",
      "https://example.com/a",
      "Member A",
      "2026-07-10",
      "New Post",
    ],
    ["Print Your Wear", "https://example.com/b", "Member A", "2026-07-11", ""],
  ]);
  const result = reconcileWorkSourceRows(source);
  assert.equal(result.diagnostics.rawRows, 2);
  assert.equal(result.diagnostics.acceptedCandidates, 1);
  assert.equal(result.diagnostics.needsAttention, 1);
  assert.equal(result.quarantinedRows[0].sourceRowNumber, 3);
});

test("source persistence reuses canonical project URL identity and quarantines legacy duplicates", async () => {
  const repository = await readFile(
    new URL("../repositories/work-source-rows.ts", import.meta.url),
    "utf8",
  );
  const backfill = await readFile(
    new URL("../../scripts/backfill-performance-readiness.mjs", import.meta.url),
    "utf8",
  );
  assert.match(repository, /where project_id=\$1 and url=\$2/i);
  assert.match(repository, /canonicalIdentity\.rows\[0\]/);
  assert.match(backfill, /duplicate_canonical_url/);
  assert.match(backfill, /duplicate\.project_id=p\.id and duplicate\.url=c\.url/i);
});

test("canonical data source reads the persisted quality-review note column", async () => {
  const repository = await readFile(
    new URL("../repositories/data-source.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /r\.admin_note as review_notes/i);
  assert.doesNotMatch(repository, /r\.notes as review_notes/i);
});

test("unified pages gate incompatible database schemas before canonical queries", async () => {
  const syncPage = await readFile(
    new URL("../../app/admin/sync/page.tsx", import.meta.url),
    "utf8",
  );
  const dataSourcePage = await readFile(
    new URL("../../app/admin/data-source/page.tsx", import.meta.url),
    "utf8",
  );
  const readiness = await readFile(
    new URL("../schema-readiness.ts", import.meta.url),
    "utf8",
  );
  assert.match(syncPage, /checkDbSchemaHealth/);
  assert.match(dataSourcePage, /checkDbSchemaHealth/);
  assert.match(readiness, /schema_migration_required/);
});

test("unified migration runner includes the work-event foundation and explicit production acknowledgement", async () => {
  const runner = await readFile(
    new URL("../../scripts/apply-unified-migration.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runner, /20260710_url_work_events\.sql/);
  assert.match(runner, /--acknowledge-production/);
  assert.match(runner, /environment === "production"/);
});

const month = (overrides = {}) => ({
  monthKey: "2026-07-01",
  projectId: "p",
  project: "Project",
  memberId: "m",
  memberName: "Member",
  workUnits: 10,
  rawPct: 80,
  payablePct: 80,
  coveragePct: 100,
  confidence: "high",
  status: "scored",
  sourceIds: ["event-1"],
  subScores: {
    impressionPerformance: 80,
    clickPerformance: 70,
    growthCoverage: 90,
    portfolioHealth: 75,
  },
  ruleVersion: "v1",
  dataAsOf: "2026-07-28",
  ...overrides,
});
test("Performance Service range aggregation uses eligible work units and preserves N/A", () => {
  const scored = aggregatePerformanceRange(
    [month(), month({ monthKey: "2026-06-01", workUnits: 10, payablePct: 60 })],
    "3m",
  );
  assert.equal(scored.payablePct, 70);
  assert.equal(scored.coveragePct, 100);
  assert.equal(scored.status, "scored");
  const partial = aggregatePerformanceRange(
    [
      month(),
      month({
        monthKey: "2026-06-01",
        payablePct: null,
        status: "insufficient_data",
      }),
    ],
    "3m",
  );
  assert.equal(partial.coveragePct, 50);
  assert.equal(partial.payablePct, 80);
  assert.equal(partial.status, "insufficient_data");
});

test("automatic project rollup uses work units and never renormalizes system errors", () => {
  const rollup = rollupProjectsByEligibleWorkUnits([
    { project: "Large", workUnits: 30, score: 100, status: "scored" },
    { project: "Small", workUnits: 10, score: 50, status: "scored" },
  ]);
  assert.equal(rollup.score, 87.5);
  assert.equal(rollup.coveragePct, 100);
  assert.equal(
    rollupProjectsByEligibleWorkUnits([
      { project: "Broken", workUnits: 1, score: null, status: "system_error" },
    ]).status,
    "system_error",
  );
  assert.equal(
    combineAvailableScores([
      { key: "3m", score: 80, weight: 70, status: "scored" },
      { key: "6m", score: null, weight: 30, status: "system_error" },
    ]).status,
    "system_error",
  );
});

test("canonical UI keeps critical visible labels in Vietnamese", async () => {
  const paths = [
    "../../app/page.tsx",
    "../../app/admin/sync/page.tsx",
    "../../app/admin/projects/page.tsx",
    "../../app/admin/data-source/page.tsx",
    "../../app/admin/member-performance/page.tsx",
    "../../app/admin/member-review/page.tsx",
    "../../app/admin/kpi-close/page.tsx",
    "../../app/dashboard/page.tsx",
    "../../app/my-urls/page.tsx",
    "../../app/my-kpi/page.tsx",
    "../../app/url/[id]/page.tsx",
    "../../components/unified-workflows.tsx",
    "../../components/schema-migration-required.tsx",
  ];
  const ui = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  for (const forbidden of [
    "Sign in with Google",
    "Member workspace",
    "Project Settings</h2>",
    "Canonical Data Source</h2>",
    "Member Performance</h2>",
    "Member Review",
    "KPI Close",
    "No canonical Performance result",
    "No Performance snapshot",
    "Request failed",
  ]) assert.doesNotMatch(ui, new RegExp(forbidden, "i"));
  for (const required of ["Nguồn dữ liệu chuẩn", "Hiệu suất thành viên", "Chưa có event trong tháng", "Xác minh quyền GSC"])
    assert.match(ui, new RegExp(required, "i"));
  const layout = await readFile(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<html lang="vi">/);
});

test("member selectors union active members with month events and keep explicit empty states", async () => {
  const repository = await readFile(new URL("../repositories/member-options.ts", import.meta.url), "utf8");
  assert.match(repository, /from public\.members/i);
  assert.match(repository, /from public\.url_work_events/i);
  assert.match(repository, /is_active=true/i);
  for (const path of ["../../app/admin/member-performance/page.tsx", "../../app/admin/member-review/page.tsx"])
    assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /Chưa có event trong tháng/);
});

test("GSC scope accepts verified domain subdomains only when enabled and keeps URL-prefix strict", () => {
  assert.equal(gscPropertyCoversUrl("sc-domain:printyourwear.com", "https://magazine.printyourwear.com/a", true), true);
  assert.equal(gscPropertyCoversUrl("sc-domain:printyourwear.com", "https://magazine.printyourwear.com/a", false), false);
  assert.equal(gscPropertyCoversUrl("https://printyourwear.com/blog/", "https://printyourwear.com/blog/a", false), true);
  assert.equal(gscPropertyCoversUrl("https://printyourwear.com/blog/", "https://printyourwear.com/shop/a", false), false);
});

test("range weighting removes duplicate effective horizons before renormalizing", () => {
  const result = combineAvailableScores([
    { key: "3m", score: 80, weight: 60, status: "scored", effectiveHorizon: "2026-05:2026-07" },
    { key: "6m", score: 80, weight: 30, status: "scored", effectiveHorizon: "2026-05:2026-07" },
    { key: "all_time", score: 60, weight: 10, status: "scored", effectiveHorizon: "2025-01:2026-07" },
  ]);
  assert.equal(result.reason, "duplicate_effective_horizon_removed");
  assert.deepEqual(result.deduplicatedKeys, ["6m"]);
  assert.ok(Math.abs(result.score - (80 * 60 + 60 * 10) / 70) < 1e-9);
});

test("per-member KPI config validates optional Social + Video without silent renormalization", () => {
  assert.equal(
    validateMemberKpiConfig({
      socialVideoEnabled: false,
      weights: { seoContent: 60, seoPerformance: 40, socialVideo: 0 },
    }).components.length,
    3,
  );
  assert.throws(
    () =>
      validateMemberKpiConfig({
        socialVideoEnabled: false,
        weights: { seoContent: 50, seoPerformance: 40, socialVideo: 10 },
      }),
    /0%/,
  );
  assert.throws(
    () =>
      validateMemberKpiConfig({
        socialVideoEnabled: true,
        weights: { seoContent: 50, seoPerformance: 30, socialVideo: 10 },
      }),
    /total 100/,
  );
});

test("Final KPI uses only three components and supports justified Social N/A", () => {
  const scored = (pct) =>
    scoreBase({
      ruleVersion: "test",
      state: "scored",
      rawPct: pct,
      payablePct: pct,
      coveragePct: 100,
    });
  const result = calculateFinalMonthlyKpi({
    components: [
      { key: "seo_content", weightPct: 60, required: true, score: scored(90) },
      {
        key: "seo_performance",
        weightPct: 20,
        required: false,
        score: scored(80),
      },
      {
        key: "social_video",
        weightPct: 20,
        required: true,
        allowsNa: true,
        score: scoreBase({
          ruleVersion: "test",
          state: "not_applicable",
          reason: "no_assignment",
        }),
      },
    ],
  });
  assert.equal(result.payablePct, 87.5);
  assert.equal(result.coveragePct, 80);
});

test("remediation migration is additive, idempotent, and marks legacy contribution architecture unused", async () => {
  const base = await readFile(
    new URL(
      "../../migrations/20260715_unified_application.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const remediation = await readFile(
    new URL(
      "../../migrations/20260715_unified_remediation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const table of [
    "monthly_member_targets",
    "monthly_member_kpi_configs",
    "monthly_member_kpi_config_components",
  ])
    assert.match(
      remediation,
      new RegExp(`create table if not exists public\\.${table}`, "i"),
    );
  assert.match(remediation, /source_lineage jsonb/i);
  assert.match(remediation, /idempotency_key text/i);
  assert.doesNotMatch(
    remediation,
    /drop table.*member_project_contribution_weights/i,
  );
  assert.doesNotMatch(
    base,
    /insert into public\.member_project_contribution_weights/i,
  );
});

test("Performance lineage query does not select the missing monthly result source_ids column", async () => {
  const service = await readFile(
    new URL("../services/performance-service.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(service, /\br\.source_ids\b/i);
  assert.match(service, /r\.diagnostics\s*->\s*'eventIds'/i);
});

test("new workflow has no contribution control, write action, or contribution query", async () => {
  const files = await Promise.all([
    readFile(
      new URL("../../components/unified-workflows.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../repositories/project-settings.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../services/performance-service.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const workflow = files.join("\n");
  assert.doesNotMatch(workflow, /ContributionWeightsForm/);
  assert.doesNotMatch(workflow, /action\s*[:=]\s*["']contribution_weights/);
  assert.doesNotMatch(
    workflow,
    /from public\.member_project_contribution_weights/i,
  );
});

test("canonical Admin and Member route contracts exist", async () => {
  const routes = [
    "../../app/api/admin/source-pipeline/status/route.ts",
    "../../app/api/admin/source-pipeline/preview/route.ts",
    "../../app/api/admin/source-pipeline/commit/route.ts",
    "../../app/api/admin/projects/options/route.ts",
    "../../app/api/admin/projects/[project]/config/route.ts",
    "../../app/api/admin/projects/[project]/test-gsc/route.ts",
    "../../app/api/admin/data-source/route.ts",
    "../../app/api/admin/performance/refresh/route.ts",
    "../../app/api/admin/performance/status/route.ts",
    "../../app/api/admin/member-review/route.ts",
    "../../app/api/admin/member-review/target/route.ts",
    "../../app/api/admin/member-review/reviews/route.ts",
    "../../app/api/admin/kpi-close/route.ts",
    "../../app/api/admin/kpi-close/config/route.ts",
    "../../app/api/admin/kpi-close/social/route.ts",
    "../../app/api/admin/kpi-close/preview/route.ts",
    "../../app/api/admin/kpi-close/finalize/route.ts",
    "../../app/api/admin/kpi-close/reopen/route.ts",
  ];
  for (const route of routes) await access(new URL(route, import.meta.url));
});
