import { normalizeWorkType, parseSourceDate } from "../domain/normalization.ts";

export type LegacyContentSheetRow = {
  project: string;
  url: string;
  member_name: string;
  content_worked_at: string | null;
  content_type: string | null;
  source_row_number: number;
};

const headerAliases: Record<string, string[]> = {
  project: ["project", "project name"],
  url: ["url", "content url", "live url"],
  member_name: ["member_name", "member", "member name", "owner"],
  content_worked_at: ["date", "work date", "content_worked_at", "completed at", "published at"],
  content_type: ["type", "work type", "content type", "content_type"],
};

const headerKey = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function legacySheetHasHeader(values: unknown[][]): boolean {
  if (!values.length) return false;
  const keys = values[0].map(headerKey);
  const matches = Object.values(headerAliases).filter((aliases) => aliases.some((alias) => keys.includes(alias))).length;
  return matches >= 2;
}

function indexesForHeader(header: unknown[]) {
  const keys = header.map(headerKey);
  return Object.fromEntries(Object.entries(headerAliases).map(([field, aliases]) => [field, keys.findIndex((key) => aliases.includes(key))]));
}

export function parseLegacyContentSheet(values: unknown[][]): LegacyContentSheetRow[] {
  if (!values.length) return [];
  const hasHeader = legacySheetHasHeader(values);
  const indexes = hasHeader
    ? indexesForHeader(values[0])
    : { project: 0, url: 1, member_name: 2, content_worked_at: 3, content_type: 4 };
  return values.slice(hasHeader ? 1 : 0).map((row, index) => ({
    project: String(row[indexes.project] ?? "").trim(),
    url: String(row[indexes.url] ?? "").trim(),
    member_name: String(row[indexes.member_name] ?? "").trim(),
    content_worked_at: parseSourceDate(row[indexes.content_worked_at]),
    content_type: normalizeWorkType(row[indexes.content_type]),
    source_row_number: index + (hasHeader ? 2 : 1),
  }));
}
