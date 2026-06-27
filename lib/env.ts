export type MemberEmailMap = Record<string, string>;
export type ProjectGscMap = Record<string, string>;

export type EnvResult<T> = { value: T; errors: string[] };

function parseJsonMap<T extends Record<string, string>>(value: string | undefined, name: string): EnvResult<T> {
  if (!value) return { value: {} as T, errors: [] };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    const map = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, val]) => [key.trim(), String(val).trim()])
    ) as T;
    return { value: map, errors: [] };
  } catch {
    return { value: {} as T, errors: [`${name} must be a valid JSON object, for example {"Jane":"jane@example.com"}.`] };
  }
}

export function getMemberEmailMapResult(): EnvResult<MemberEmailMap> {
  return parseJsonMap<MemberEmailMap>(process.env.MEMBER_EMAIL_MAP, "MEMBER_EMAIL_MAP");
}

export function getProjectGscMapResult(): EnvResult<ProjectGscMap> {
  return parseJsonMap<ProjectGscMap>(process.env.PROJECT_GSC_MAP, "PROJECT_GSC_MAP");
}

export function getMemberEmailMap(): MemberEmailMap {
  return getMemberEmailMapResult().value;
}

export function getProjectGscMap(): ProjectGscMap {
  return getProjectGscMapResult().value;
}

export function getEnvErrors(): string[] {
  return [...getMemberEmailMapResult().errors, ...getProjectGscMapResult().errors];
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const appConfig = {
  sheetId: process.env.GOOGLE_SHEET_ID ?? "",
  contentTab: process.env.GOOGLE_SHEET_TAB || "content_urls",
  allTimeStartDate: process.env.ALL_TIME_START_DATE || "2024-01-01",
  cacheTtlDays: Number(process.env.CACHE_TTL_DAYS || 7)
};
