import type { UrlMetrics } from "./google";

export type OpportunityLabel = "no_data" | "ctr_opportunity" | "ranking_opportunity" | "winner" | "low_visibility" | "normal";

export function classifyOpportunity(metrics: UrlMetrics): OpportunityLabel {
  if (metrics.clicks === 0 && metrics.impressions === 0) return "no_data";
  if (metrics.impressions >= 100 && metrics.ctr < 0.01) return "ctr_opportunity";
  if (metrics.impressions >= 100 && metrics.position >= 8 && metrics.position <= 20) return "ranking_opportunity";
  if (metrics.clicks > 0 && metrics.position <= 5) return "winner";
  if (metrics.impressions < 100) return "low_visibility";
  return "normal";
}

export function labelText(label: OpportunityLabel) {
  const labels: Record<OpportunityLabel, string> = {
    no_data: "Chưa đủ dữ liệu để đánh giá",
    ctr_opportunity: "Cơ hội cải thiện CTR",
    ranking_opportunity: "Cơ hội cải thiện thứ hạng",
    winner: "URL hiệu quả tốt",
    low_visibility: "Độ hiển thị thấp",
    normal: "Bình thường",
  };
  return labels[label];
}
