import { aggregateCompared, type ComparedUrlPerformance } from "./growth";
export type MemberScore = ReturnType<typeof scoreMember>;
const clamp = (n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
function growthPoints(p:number|null){ if(p===null) return 70; return clamp(50 + p*100); }
export function scoreMember(member_name: string, rows: ComparedUrlPerformance[], maxClicks: number, maxImpressions: number) {
  const a = aggregateCompared(rows);
  const urlCount = rows.length || 1;
  const score = clamp(
    (maxClicks ? (a.clicks / maxClicks) * 30 : 0) +
    growthPoints(a.click_growth_pct) * 0.25 +
    (maxImpressions ? (a.impressions / maxImpressions) * 15 : 0) +
    (a.growing / urlCount) * 15 -
    (a.noData / urlCount) * 10 -
    (a.declining / urlCount) * 15
  );
  const supportSignal = a.noData / urlCount >= 0.3 ? "Needs data" : a.declining / urlCount >= 0.3 || (a.click_growth_pct ?? 0) <= -0.2 ? "Needs support" : score >= 75 && (a.click_growth_pct ?? 0) > 0 ? "Strong performer" : (a.click_growth_pct ?? 0) >= 0.1 || (a.impression_growth_pct ?? 0) >= 0.15 ? "Growing" : "Stable";
  return { member_name, urlCount: rows.length, ...a, score: Math.round(score), supportSignal };
}
export function scoreMembers(rows: ComparedUrlPerformance[]) {
  const grouped = Object.entries(rows.reduce<Record<string, ComparedUrlPerformance[]>>((acc,r)=>{(acc[r.member_name]??=[]).push(r); return acc;},{}));
  const aggs = grouped.map(([name,list])=>[name,list,aggregateCompared(list)] as const);
  const maxClicks = Math.max(1,...aggs.map(([, ,a])=>a.clicks));
  const maxImpressions = Math.max(1,...aggs.map(([, ,a])=>a.impressions));
  return aggs.map(([name,list])=>scoreMember(name,list,maxClicks,maxImpressions)).sort((a,b)=>b.score-a.score);
}
