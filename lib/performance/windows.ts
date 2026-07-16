export type EvaluationWindow = { startDate: string; endDate: string; days: number };
export type EventWindows = { pre: EvaluationWindow; post: EvaluationWindow; lagDays: number; complete: boolean };

const date = (key: string) => new Date(`${key}T00:00:00.000Z`);
const addDays = (key: string, days: number) => { const value = date(key); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

export function buildEventWindows(workDate: string, preWindowDays = 28, postWindowDays = 28, seoLagDays = 28, dataCutoff?: string): EventWindows {
  const preEnd = addDays(workDate, -1);
  const preStart = addDays(preEnd, -(preWindowDays - 1));
  const postStart = addDays(workDate, seoLagDays + 1);
  const postEnd = addDays(postStart, postWindowDays - 1);
  return { pre: { startDate: preStart, endDate: preEnd, days: preWindowDays }, post: { startDate: postStart, endDate: postEnd, days: postWindowDays }, lagDays: seoLagDays, complete: !dataCutoff || postEnd <= dataCutoff };
}

export function laterEventContaminates(workDate: string, nextWorkDate: string | null | undefined, postWindow: EvaluationWindow) {
  return Boolean(nextWorkDate && nextWorkDate > workDate && nextWorkDate <= postWindow.endDate);
}

export type FallbackEventWindows = EventWindows & {
  effectiveWindowDays: number;
  fallbackLevel: "full" | "14d" | "7d" | "provisional" | "unavailable";
};

export function buildFallbackEventWindows(input: {
  workDate: string;
  dataCutoff: string;
  seoLagDays?: number;
  fallbackDays?: number[];
  allowProvisional?: boolean;
}): FallbackEventWindows {
  const seoLagDays = input.seoLagDays ?? 28;
  const postStart = addDays(input.workDate, seoLagDays + 1);
  const availableDays = Math.max(
    0,
    Math.floor((date(input.dataCutoff).getTime() - date(postStart).getTime()) / 86_400_000) + 1,
  );
  const fallbackDays = [...(input.fallbackDays ?? [28, 14, 7])]
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  const selected = fallbackDays.find((value) => value <= availableDays) ??
    (input.allowProvisional && availableDays > 0 ? availableDays : 0);
  const level =
    selected >= (fallbackDays[0] ?? 28)
      ? "full"
      : selected >= 14
        ? "14d"
        : selected >= 7
          ? "7d"
          : selected > 0
            ? "provisional"
            : "unavailable";
  const days = Math.max(selected, 1);
  const preEnd = addDays(input.workDate, -1);
  const preStart = addDays(preEnd, -(days - 1));
  const postEnd = addDays(postStart, days - 1);
  return {
    pre: { startDate: preStart, endDate: preEnd, days },
    post: { startDate: postStart, endDate: postEnd, days },
    lagDays: seoLagDays,
    complete: level !== "unavailable" && level !== "provisional",
    effectiveWindowDays: selected,
    fallbackLevel: level,
  };
}
