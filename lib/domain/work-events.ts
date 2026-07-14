import crypto from "crypto";

export const workTypes = ["new_content", "audit", "update", "portfolio"] as const;
export type WorkType = typeof workTypes[number];

export const workEventStatuses = ["planned", "in_progress", "reviewed", "completed", "approved", "on_hold", "excluded"] as const;
export type WorkEventStatus = typeof workEventStatuses[number];

export function isWorkType(value: unknown): value is WorkType {
  return workTypes.includes(String(value || "") as WorkType);
}

export function canCreateSheetWorkEvent(workDate: string | null | undefined, workType: unknown): workType is WorkType {
  return Boolean(workDate) && isWorkType(workType);
}

export function canonicalContentUrlHash(project: string, normalizedUrl: string) {
  return crypto.createHash("sha256").update(`${project.trim().toLowerCase()}|${normalizedUrl}`).digest("hex");
}

export function sheetWorkEventSourceRowKey(input: {
  project: string;
  normalizedUrl: string;
  memberName: string;
  workDate: string;
  workType: WorkType;
}) {
  const identity = [
    input.project.trim().toLowerCase(),
    input.normalizedUrl,
    input.memberName.trim().toLowerCase(),
    input.workDate,
    input.workType,
  ].join("|");
  return `content_urls:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}
