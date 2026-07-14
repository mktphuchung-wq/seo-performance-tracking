export type ShadowDifferenceInput = {
  componentKey: string;
  sourceUrl?: string | null;
  workEventId?: string | null;
  ruleVersion?: string | null;
  sheetValue?: number | null;
  v2Value?: number | null;
  explanationCategory?: string | null;
  explanation?: string | null;
  evidence?: Record<string, unknown>;
};

export function isShadowDifferenceExplained(row: ShadowDifferenceInput, delta: number | null) {
  if (delta === 0) return true;
  return delta !== null && Boolean(row.explanationCategory?.trim() && row.explanation?.trim() && (row.sourceUrl?.trim() || row.ruleVersion?.trim()));
}
