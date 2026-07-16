import type { WorkType } from "../domain/work-events.ts";
import { buildFallbackEventWindows, laterEventContaminates } from "./windows.ts";

export type PerformanceWorkEvent = {
  id: string;
  contentUrlId: string;
  canonicalUrl: string;
  project: string;
  memberName: string;
  workType: WorkType;
  workDate: string;
  unitValue: number;
  status: string;
  isCountable: boolean;
  nextWorkDate?: string | null;
  isSeasonal?: boolean;
};

export type SelectedPerformanceEvent = PerformanceWorkEvent & { preStartDate: string; preEndDate: string; postStartDate: string; postEndDate: string; effectiveWindowDays: number; fallbackLevel: string; contaminated: boolean; comparable: boolean; exclusionReason: string | null };

export function selectEventCohort(input: {
  events: PerformanceWorkEvent[];
  project: string;
  memberName: string;
  dataCutoff: string;
  eligibleWorkTypes: WorkType[];
  preWindowDays?: number;
  postWindowDays?: number;
  seoLagDays?: number;
  seasonalityMode?: "year_over_year" | "pm_review" | "ignore";
  strategy?: "new_project" | "growth_project" | "stable_audit";
  fallbackDays?: number[];
}) {
  return input.events
    .filter((event) => event.project === input.project && event.memberName === input.memberName && event.isCountable && ["completed", "approved"].includes(event.status) && input.eligibleWorkTypes.includes(event.workType))
    .map<SelectedPerformanceEvent>((event) => {
      const windows = buildFallbackEventWindows({ workDate: event.workDate, dataCutoff: input.dataCutoff, seoLagDays: input.seoLagDays, fallbackDays: input.fallbackDays, allowProvisional: input.strategy === "new_project" });
      const contaminated = laterEventContaminates(event.workDate, event.nextWorkDate, windows.post);
      const seasonalReview = Boolean(event.isSeasonal && input.seasonalityMode !== "year_over_year");
      const exclusionReason = windows.fallbackLevel === "unavailable" ? "post_window_incomplete" : contaminated ? "later_event_contamination" : seasonalReview ? "seasonality_pm_review" : null;
      return { ...event, preStartDate: windows.pre.startDate, preEndDate: windows.pre.endDate, postStartDate: windows.post.startDate, postEndDate: windows.post.endDate, effectiveWindowDays: windows.effectiveWindowDays, fallbackLevel: windows.fallbackLevel, contaminated, comparable: !exclusionReason, exclusionReason };
    });
}
