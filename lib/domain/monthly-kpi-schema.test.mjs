import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../migrations/20260710_monthly_kpi.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

test("Phase 3 migration creates all required monthly KPI tables", () => {
  for (const table of [
    "monthly_member_kpi_targets",
    "kpi_work_unit_rules",
    "kpi_quality_criteria",
    "url_work_quality_reviews",
    "url_work_quality_scores",
    "member_month_quality_reviews",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
  }
});

test("monthly targets are unique by month, project, and member", () => {
  assert.match(migration, /unique \(month_key, project, member_name\)/i);
  assert.match(migration, /month_key = date_trunc\('month', month_key\)::date/i);
});

test("global work-unit defaults preserve audit difficulty values", () => {
  const expectedRules = [
    ["new_content", "normal", "1"],
    ["update", "normal", "1"],
    ["audit", "basic", "1"],
    ["audit", "standard", "1.2"],
    ["audit", "deep", "1.5"],
    ["portfolio", "normal", "0"],
  ];

  for (const [workType, difficulty, unitValue] of expectedRules) {
    assert.ok(
      migration.includes(`(null, null, '${workType}', '${difficulty}', ${unitValue}, 'Phase 3 global default')`),
      `missing ${workType}/${difficulty}=${unitValue} seed`,
    );
  }
});

test("quality criteria are split between URL and member-month review levels", () => {
  for (const criterion of ["structure", "content", "metadata", "image_video", "links"]) {
    assert.match(migration, new RegExp(`'${criterion}',[^\\n]+?'url'`, "i"));
  }
  for (const criterion of ["frequency", "collaboration"]) {
    assert.match(migration, new RegExp(`'${criterion}',[^\\n]+?'member_month'`, "i"));
  }
  assert.match(migration, /check \(score between 1 and 5\)/i);
});

test("seed inserts are safe to rerun", () => {
  assert.equal((migration.match(/on conflict do nothing;/gi) ?? []).length, 2);
  assert.match(migration, /column_name = 'rule_version'[\s\S]+create unique index if not exists kpi_work_unit_rules_scope_key/i);
  assert.match(migration, /column_name = 'rubric_version_id'[\s\S]+create unique index if not exists kpi_quality_criteria_scope_key/i);
});
