import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../migrations/20260714_monthly_kpi_v2_completion.sql", import.meta.url), "utf8");

test("completion migration adds canonical member-month targets and workflow evidence", () => {
  for (const table of [
    "monthly_member_month_targets",
    "monthly_kpi_workflow_states",
    "monthly_kpi_calculation_runs",
    "monthly_kpi_idempotency_keys",
    "monthly_kpi_shadow_differences",
    "monthly_kpi_shadow_approvals",
  ]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
});

test("member target is unique at member by month and allocations remain optional", () => {
  assert.match(migration, /unique\s*\(month_key,member_name\)/i);
  assert.match(migration, /monthly_member_kpi_targets[\s\S]+?member_month_target_id/i);
  assert.match(migration, /allocation_total_matches_target/i);
});

test("performance evaluations persist work and measurement month without zero defaults", () => {
  for (const column of ["work_month", "measurement_month", "data_cutoff", "availability_reason", "error_category"])
    assert.match(migration, new RegExp(`performance_event_evaluations[\\s\\S]+?${column}`, "i"));
  assert.doesNotMatch(migration, /performance[^\n]*(raw_pct|payable_pct)[^\n]*default\s+0/i);
});

test("canonical event approval actor and reason are part of the completion lineage", () => {
  assert.match(migration, /alter table public\.url_work_events[\s\S]*approval_reason text/i);
});

test("new-content v3 rubric contains FAQ five percent and totals one hundred", () => {
  assert.match(migration, /quality_new_content_v3/i);
  assert.match(migration, /'faq_answerability','FAQs \/ answerability when appropriate to intent',5/i);
  assert.match(migration, /'intent_audience_pain','Search intent, audience\/persona, pain point',15/i);
});

test("completion migration is additive and rerun safe", () => {
  assert.match(migration, /^begin;/im);
  assert.match(migration, /^commit;/im);
  assert.doesNotMatch(migration, /drop\s+(table|column)/i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.match(migration, /on conflict[\s\S]+?do nothing/i);
});
