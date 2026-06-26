export type MemberEmailMap = Record<string, string>;
export type ProjectGscMap = Record<string, string>;

function parseJsonMap<T extends Record<string, string>>(value: string | undefined, name: string): T {
  if (!value) return {} as T;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, val]) => [key.trim(), String(val).trim()])
    ) as T;
  } catch {
    throw new Error(`${name} must be a JSON object, for example {"Jane":"jane@example.com"}`);
  }
}

export function getMemberEmailMap(): MemberEmailMap {
  return parseJsonMap<MemberEmailMap>(process.env.MEMBER_EMAIL_MAP, "MEMBER_EMAIL_MAP");
}

export function getProjectGscMap(): ProjectGscMap {
  return parseJsonMap<ProjectGscMap>(process.env.PROJECT_GSC_MAP, "PROJECT_GSC_MAP");
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const appConfig = {
  sheetId: process.env.GOOGLE_SHEET_ID ?? "",
  contentTab: "content_urls",
  gscStartDate: process.env.GSC_START_DATE,
  gscEndDate: process.env.GSC_END_DATE
};
