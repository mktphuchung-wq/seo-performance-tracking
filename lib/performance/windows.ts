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
