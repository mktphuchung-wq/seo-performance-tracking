import assert from "node:assert/strict";
import test from "node:test";
import { canCreateSheetWorkEvent, isWorkType, sheetWorkEventSourceRowKey } from "./work-events.ts";

const base = {
  project: "Project A",
  normalizedUrl: "https://example.com/page",
  memberName: "Lan",
  workDate: "2026-07-01",
  workType: "audit",
};

test("source keys are deterministic for the same sheet work event", () => {
  assert.equal(sheetWorkEventSourceRowKey(base), sheetWorkEventSourceRowKey({ ...base }));
});

test("the same URL worked on different dates keeps separate history", () => {
  assert.notEqual(sheetWorkEventSourceRowKey(base), sheetWorkEventSourceRowKey({ ...base, workDate: "2026-07-15" }));
});

test("the same URL with a different work type is a separate event", () => {
  assert.notEqual(sheetWorkEventSourceRowKey(base), sheetWorkEventSourceRowKey({ ...base, workType: "update" }));
});

test("missing dates and missing or unsupported work types do not create events", () => {
  assert.equal(canCreateSheetWorkEvent(null, "audit"), false);
  assert.equal(canCreateSheetWorkEvent("2026-07-01", null), false);
  assert.equal(canCreateSheetWorkEvent("2026-07-01", "unknown"), false);
  assert.equal(canCreateSheetWorkEvent("2026-07-01", "new_content"), true);
  assert.equal(isWorkType("portfolio"), true);
});
