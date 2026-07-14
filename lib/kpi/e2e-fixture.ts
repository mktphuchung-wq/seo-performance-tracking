export function isKpiE2eFixtureMode() {
  return process.env.KPI_E2E_FIXTURE_MODE === "true" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

export function kpiE2eFixtureAudit(month: string, locked = false) {
  const memberName = "Hướng Dương";
  const componentDefinitions = [
    { component_key: "discipline", name: "Discipline / Attitude", default_weight_pct: 10, is_controllable: true, is_required: true },
    { component_key: "seo_content", name: "SEO Content", default_weight_pct: 50, is_controllable: false, is_required: true },
    { component_key: "seo_performance", name: "SEO Performance", default_weight_pct: 20, is_controllable: false, is_required: false },
    { component_key: "social_video", name: "Social Content + Video", default_weight_pct: 20, is_controllable: true, is_required: true },
  ];
  const components = [
    { member_name: memberName, component_key: "discipline", payable_pct: 100, status: "approved", rule_version: "manual_component_v2" },
    { member_name: memberName, component_key: "seo_content", payable_pct: 80, status: "scored", rule_version: "seo_content_member_month_v3", diagnostics: { actualUnits: 22, targetUnits: 22, quantityRawPct: 100, quantityPct: 100, qualityPct: 75, qualityCoveragePct: 100, qualityAggregation: "event_unit_weighted_average" } },
    { member_name: memberName, component_key: "seo_performance", payable_pct: 100, status: "scored", rule_version: "performance_measurement_v3" },
    { member_name: memberName, component_key: "social_video", payable_pct: 90, status: "approved", rule_version: "manual_component_v2" },
  ];
  const result = { id: "fixture-result", member_name: memberName, version: 1, status: "locked", payable_pct: 88, payout_vnd: 2_640_000, shadow_only: true };
  return {
    month,
    members: [
      { member_name: memberName, member_email: "huong.fixture@example.test", event_count: 1, has_target: 1 },
      { member_name: "Như Tuyền", member_email: "tuyen.fixture@example.test", event_count: 1, has_target: 1 },
      { member_name: "Yến Phương", member_email: "phuong.fixture@example.test", event_count: 1, has_target: 1 },
    ],
    targets: [{ id: "fixture-target", member_name: memberName, target_units: 22 }], allocations: [], projectResults: [], componentDefinitions, components,
    results: locked ? [result] : [], overrides: [],
    events: [{ work_event_id: "fixture-event", content_url_id: "fixture-url", project: "Fixture Project", member_name: memberName, work_type: "new_content", work_date: `${month}-10`, status: "completed", is_countable: true, unit_value: 1, unit_rule_version: "unit_rules_v2", canonical_url_snapshot: "https://example.test/fixture-content", source: "slack_list_sheet", source_item_id: "SLACK-FIXTURE-1", review_status: "approved", quality_pct: 75, rubric_version_snapshot: "quality_new_content_v3" }],
    reviews: [], performance: [{ id: "fixture-performance", project: "Fixture Project", member_name: memberName, strategy: "growth_project", payable_pct: 100, status: "scored", mature_event_units: 1, candidate_event_units: 1, coverage_pct: 100, data_as_of: `${month}-31`, rule_version: "performance_measurement_v3", availability_reason: "available", error_category: null }],
    workflow: [{ member_name: memberName, state: locked ? "locked" : "calculated" }], runs: [{ id: "fixture-run", step: "calculate", status: "succeeded", started_at: `${month}-20T08:00:00.000Z`, request_id: "fixture-request" }], differences: [], approvals: [],
    reconciliation: { raw_row_count: 2, logical_item_count: 1, duplicate_variant_count: 1, quarantined_count: 0, canonical_event_count: 1, finished_at: `${month}-20T08:00:00.000Z` },
  };
}

export const kpiE2eFixturePreview = { state: "scored", payablePct: 88, payoutVnd: 2_640_000, coveragePct: 100, ruleVersion: "monthly_final_v2" };
