import type { WorkType } from "../domain/work-events.ts";
import { buildEventWindows, laterEventContaminates } from "./windows.ts";

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

export type SelectedPerformanceEvent = PerformanceWorkEvent & { preStartDate: string; preEndDate: string; postStartDate: string; postEndDate: string; contaminated: boolean; comparable: boolean; exclusionReason: string | null };

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
}) {
  return input.events
    .filter((event) => event.project === input.project && event.memberName === input.memberName && event.isCountable && ["completed", "approved"].includes(event.status) && input.eligibleWorkTypes.includes(event.workType))
    .map<SelectedPerformanceEvent>((event) => {
      const windows = buildEventWindows(event.workDate, input.preWindowDays, input.postWindowDays, input.seoLagDays, input.dataCutoff);
      const contaminated = laterEventContaminates(event.workDate, event.nextWorkDate, windows.post);
      const seasonalReview = Boolean(event.isSeasonal && input.seasonalityMode !== "year_over_year");
      const exclusionReason = !windows.complete ? "post_window_incomplete" : contaminated ? "later_event_contamination" : seasonalReview ? "seasonality_pm_review" : null;
      return { ...event, preStartDate: windows.pre.startDate, preEndDate: windows.pre.endDate, postStartDate: windows.post.startDate, postEndDate: windows.post.endDate, contaminated, comparable: !exclusionReason, exclusionReason };
    });
}
