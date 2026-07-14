import assert from "node:assert/strict";
import test from "node:test";
import { KpiApiError, optionalNumber, parseMonth, requireIdempotencyKey, requireString } from "../kpi/api-contract.ts";

test("month API contract preserves YYYY-MM for client routing", () => {
  assert.equal(parseMonth("2026-07"), "2026-07");
  for (const invalid of ["2026-07-01", "2026-00", "2026-13", "July 2026"]) {
    assert.throws(() => parseMonth(invalid), (error) => error instanceof KpiApiError && error.code === "INVALID_MONTH");
  }
});

test("API validation preserves missing numbers and requires workflow identifiers", () => {
  assert.equal(optionalNumber(null, "score"), null);
  assert.equal(optionalNumber("0", "score"), 0);
  assert.equal(requireString(" Hướng Dương ", "memberName"), "Hướng Dương");
  assert.throws(() => optionalNumber("NaN", "score"), (error) => error instanceof KpiApiError && error.field === "score");
  assert.equal(requireIdempotencyKey(new Request("https://example.test", { headers: { "Idempotency-Key": "fixture-key" } })), "fixture-key");
  assert.throws(() => requireIdempotencyKey(new Request("https://example.test")), (error) => error instanceof KpiApiError && error.code === "IDEMPOTENCY_KEY_REQUIRED");
});
