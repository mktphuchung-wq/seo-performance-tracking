import assert from "node:assert/strict";
import test from "node:test";
import { isShadowDifferenceExplained } from "../kpi/shadow-evidence.ts";

test("shadow differences require a value delta, explanation, and URL or rule lineage", () => {
  const base = { componentKey: "seo_content", explanationCategory: "rule", explanation: "Sheet used the legacy unit rule.", ruleVersion: "seo_content_member_month_v3" };
  assert.equal(isShadowDifferenceExplained(base, 0), true);
  assert.equal(isShadowDifferenceExplained(base, 5), true);
  assert.equal(isShadowDifferenceExplained({ ...base, ruleVersion: null }, 5), false);
  assert.equal(isShadowDifferenceExplained({ ...base, explanation: null }, 5), false);
  assert.equal(isShadowDifferenceExplained(base, null), false);
});
