import { aggregateCompared, type ComparedUrlPerformance } from "./growth";

export type MemberScore = ReturnType<typeof scoreMember>;

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
function growthPoints(p: number | null) { if (p === null) return 70; return clamp(50 + p * 100); }
function healthLabel(decliningRate: number, noDataRate: number, growth: number | null) {
  if (noDataRate >= 0.3) return "Data gaps";
  if (decliningRate >= 0.35 || (growth ?? 0) <= -0.2) return "At risk";
  if ((growth ?? 0) >= 0.15 && decliningRate <= 0.2) return "Healthy growth";
  return "Monitor";
}

export function scoreMember(member_name: string, rows: ComparedUrlPerformance[], maxClicks: number, maxImpressions: number, maxUrls: number) {
  const a = aggregateCompared(rows);
  const urlCount = rows.length || 1;
  const decliningRate = a.declining / urlCount;
  const noDataRate = a.noData / urlCount;
  const growingRate = a.growing / urlCount;
  const quantityIndex = clamp(
    (maxUrls ? (rows.length / maxUrls) * 35 : 0) +
    (maxClicks ? (a.clicks / maxClicks) * 40 : 0) +
    (maxImpressions ? (a.impressions / maxImpressions) * 25 : 0)
  );
  const qualityIndex = clamp(
    growthPoints(a.click_growth_pct) * 0.35 +
    growthPoints(a.impression_growth_pct) * 0.2 +
    growingRate * 20 +
    (a.ctr ? clamp(a.ctr * 400) * 0.1 : 0) +
    (a.position ? clamp((50 - a.position) * 2) * 0.1 : 0) -
    noDataRate * 20 -
    decliningRate * 25
  );
  const supportSignal = noDataRate >= 0.3 ? "Needs data" : decliningRate >= 0.3 || (a.click_growth_pct ?? 0) <= -0.2 ? "Needs support" : qualityIndex >= 75 && (a.click_growth_pct ?? 0) > 0 ? "Strong performer" : (a.click_growth_pct ?? 0) >= 0.1 || (a.impression_growth_pct ?? 0) >= 0.15 ? "Growing" : "Stable";
  const priorityActions = rows.filter((r) => r.status === "declining" || r.status === "no_data").length;
  const activeUrls = rows.length;
  const urlsThisMonth = rows.length;
  const urlsWithData = rows.length - a.noData;
  return { member_name, urlCount: rows.length, activeUrls, urlsThisMonth, urlsWithData, ...a, quantityIndex: Math.round(quantityIndex), qualityIndex: Math.round(qualityIndex), portfolioHealth: healthLabel(decliningRate, noDataRate, a.click_growth_pct), priorityActions, supportSignal };
}

export function scoreMembers(rows: ComparedUrlPerformance[]) {
  const grouped = Object.entries(rows.reduce<Record<string, ComparedUrlPerformance[]>>((acc, r) => { (acc[r.member_name] ??= []).push(r); return acc; }, {}));
  const aggs = grouped.map(([name, list]) => [name, list, aggregateCompared(list)] as const);
  const maxClicks = Math.max(1, ...aggs.map(([, , a]) => a.clicks));
  const maxImpressions = Math.max(1, ...aggs.map(([, , a]) => a.impressions));
  const maxUrls = Math.max(1, ...aggs.map(([, list]) => list.length));
  return aggs.map(([name, list]) => scoreMember(name, list, maxClicks, maxImpressions, maxUrls)).sort((a, b) => b.qualityIndex - a.qualityIndex || b.quantityIndex - a.quantityIndex);
}
