export function validateMonthlyMemberTarget(input: {
  month: string;
  memberName: string;
  targetUnits: number;
  baseTargetUnits?: number | null;
  activeWorkdayRatio?: number | null;
  adjustmentReason?: string | null;
}) {
  if (!/^\d{4}-\d{2}$/.test(input.month))
    throw new Error("Month must use YYYY-MM.");
  const memberName = input.memberName.trim();
  if (!memberName) throw new Error("Member is required.");
  if (!Number.isFinite(input.targetUnits) || input.targetUnits < 0)
    throw new Error("Target units cannot be negative.");
  const baseTargetUnits = input.baseTargetUnits ?? input.targetUnits;
  const activeWorkdayRatio = input.activeWorkdayRatio ?? 1;
  if (!Number.isFinite(baseTargetUnits) || baseTargetUnits < 0)
    throw new Error("Base target units cannot be negative.");
  if (
    !Number.isFinite(activeWorkdayRatio) ||
    activeWorkdayRatio < 0 ||
    activeWorkdayRatio > 1
  )
    throw new Error("Active workday ratio must be between 0 and 1.");
  if (activeWorkdayRatio !== 1 && !input.adjustmentReason?.trim())
    throw new Error("Prorated targets require an explicit adjustment reason.");
  return {
    ...input,
    memberName,
    baseTargetUnits,
    activeWorkdayRatio,
    adjustmentReason: input.adjustmentReason?.trim() || null,
  };
}
