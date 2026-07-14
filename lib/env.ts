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
    return { value: {} as T, errors: [`${name} phải là một đối tượng JSON hợp lệ, ví dụ {"Jane":"jane@example.com"}.`] };
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
  slackListSheetId: process.env.GOOGLE_SLACK_LIST_SHEET_ID || process.env.GOOGLE_SHEET_ID || "",
  slackListTab: process.env.GOOGLE_SLACK_LIST_TAB || "Data",
  allTimeStartDate: process.env.ALL_TIME_START_DATE || "2024-01-01",
  cacheTtlDays: Number(process.env.CACHE_TTL_DAYS || 7),
  kpiEngineV2Enabled: process.env.KPI_ENGINE_V2_ENABLED === "true",
  kpiCalculationVersion: process.env.KPI_CALCULATION_VERSION || "kpi_v2",
  deploymentEnvironment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
};

export function assertKpiV2WriteEnvironment() {
  if (!appConfig.kpiEngineV2Enabled) throw new Error("KPI Engine v2 đang tắt. Chỉ đặt KPI_ENGINE_V2_ENABLED=true trên staging.");
  if (appConfig.deploymentEnvironment === "production" && process.env.KPI_V2_PRODUCTION_WRITE_ENABLED !== "true") {
    throw new Error("Chức năng ghi KPI Engine v2 trên production bị khóa cho đến khi đối soát staging và có phê duyệt rõ ràng.");
  }
}
