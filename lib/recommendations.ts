import type { ComparedUrlPerformance } from "./growth";
export function recommendationFor(row: ComparedUrlPerformance) {
  if (row.status === "no_data") return "Investigate indexing";
  if (row.position_delta > 1 || (row.position >= 8 && row.position <= 20 && row.impressions >= 100)) return "Refresh content";
  if (row.impressions >= 100 && row.ctr < 0.01) return "Improve title/meta";
  if (row.impressions < 100 && (!row.position || row.position > 20)) return "Add internal links";
  return "Monitor";
}
