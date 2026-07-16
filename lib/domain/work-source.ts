import crypto from "crypto";
import {
  defaultProjectAliases,
  normalizeAliasKey,
  normalizeCanonicalUrl,
  normalizeSourceStatus,
  normalizeWorkType,
  parseSourceDate,
  resolveAlias,
  type AliasMap,
} from "./normalization.ts";
import type { WorkEventStatus, WorkType } from "./work-events.ts";

export type WorkSourceRow = {
  source: string;
  sourceRowNumber: number;
  sourceItemId: string | null;
  projectRaw: string;
  memberRaw: string;
  workTypeRaw: string;
  sourceStatusRaw: string;
  urlRaw: string;
  workDateRaw: unknown;
  adminApproved?: boolean;
  difficulty?: string | null;
  payload?: Record<string, unknown>;
};

export type NormalizedWorkSourceRow = WorkSourceRow & {
  project: string | null;
  member: string | null;
  workType: WorkType | null;
  status: WorkEventStatus | null;
  canonicalUrl: string | null;
  isPublicUrl: boolean;
  isDraftOrAdminUrl: boolean;
  workDate: string | null;
  dateConfidence: "source_completed_at" | "fallback_source_date" | "unknown";
  logicalKey: string;
  issues: string[];
  winnerRank: number;
  isCountable: boolean;
};

export type ReconciliationResult = {
  rows: NormalizedWorkSourceRow[];
  canonicalRows: NormalizedWorkSourceRow[];
  quarantinedRows: NormalizedWorkSourceRow[];
  duplicateRows: NormalizedWorkSourceRow[];
  diagnostics: {
    rawRows: number;
    logicalItems: number;
    canonicalCompletedEvents: number;
    quarantinedRows: number;
    duplicateVariants: number;
    projectAliasMerges: number;
    draftVariantsExcluded: number;
    validWorkRecords: number;
    canonicalUrls: number;
    acceptedCandidates: number;
    needsAttention: number;
  };
};

export type ReconciliationAliases = {
  projects?: AliasMap;
  members?: AliasMap;
};

function fallbackLogicalKey(row: {
  project: string | null;
  canonicalUrl: string | null;
  member: string | null;
  workType: WorkType | null;
  workDate: string | null;
}) {
  const identity = [
    row.project,
    row.canonicalUrl,
    row.member,
    row.workType,
    row.workDate,
  ]
    .map((value) => value ?? "")
    .join("|");
  return `fallback:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function winnerRank(row: {
  adminApproved?: boolean;
  status: WorkEventStatus | null;
  canonicalUrl: string | null;
  isPublicUrl: boolean;
  isDraftOrAdminUrl: boolean;
}) {
  if (row.adminApproved || row.status === "approved") return 600;
  if (row.status === "completed" && row.isPublicUrl) return 500;
  if (row.status === "completed") return 400;
  if (row.status === "reviewed" && row.isPublicUrl) return 300;
  if (row.isDraftOrAdminUrl) return 200;
  return 100;
}

export function normalizeWorkSourceRow(
  row: WorkSourceRow,
  aliases: ReconciliationAliases = {},
): NormalizedWorkSourceRow {
  const projectAliases = {
    ...defaultProjectAliases,
    ...(aliases.projects ?? {}),
  };
  const memberAliases = aliases.members ?? {};
  const project = resolveAlias(row.projectRaw, projectAliases);
  const memberKey = normalizeAliasKey(row.memberRaw);
  const member = memberKey
    ? (memberAliases[memberKey] ?? (row.memberRaw.trim() || null))
    : null;
  const workType = normalizeWorkType(row.workTypeRaw);
  const sourceStatus = normalizeSourceStatus(
    row.adminApproved ? "approved" : row.sourceStatusRaw,
  );
  const normalizedUrl = normalizeCanonicalUrl(row.urlRaw);
  const workDate = parseSourceDate(row.workDateRaw);
  const issues: string[] = [];
  if (!project) issues.push("project_unresolved");
  if (!member) issues.push("member_unresolved");
  if (!workType) issues.push("work_type_unresolved");
  if (!sourceStatus.status) issues.push("status_unresolved");
  if (!workDate) issues.push("completion_date_missing");
  if (!normalizedUrl.canonicalUrl)
    issues.push(normalizedUrl.error ?? "url_unresolved");
  else if (!normalizedUrl.isPublic) issues.push("public_url_missing");
  const identity = {
    project,
    canonicalUrl: normalizedUrl.canonicalUrl,
    member,
    workType,
    workDate,
  };
  const logicalKey = row.sourceItemId?.trim()
    ? `${row.source.trim().toLowerCase()}:${row.sourceItemId.trim()}`
    : fallbackLogicalKey(identity);
  const rank = winnerRank({
    adminApproved: row.adminApproved,
    status: sourceStatus.status,
    canonicalUrl: normalizedUrl.canonicalUrl,
    isPublicUrl: normalizedUrl.isPublic,
    isDraftOrAdminUrl: normalizedUrl.isDraftOrAdmin,
  });
  const isCountable =
    sourceStatus.isPayableCandidate &&
    normalizedUrl.isPublic &&
    Boolean(project && member && workType && workDate);
  return {
    ...row,
    project,
    member,
    workType,
    status: sourceStatus.status,
    canonicalUrl: normalizedUrl.canonicalUrl,
    isPublicUrl: normalizedUrl.isPublic,
    isDraftOrAdminUrl: normalizedUrl.isDraftOrAdmin,
    workDate,
    dateConfidence: workDate ? "fallback_source_date" : "unknown",
    logicalKey,
    issues,
    winnerRank: rank,
    isCountable,
  };
}

export function reconcileWorkSourceRows(
  rows: WorkSourceRow[],
  aliases: ReconciliationAliases = {},
): ReconciliationResult {
  const normalized = rows.map((row) => normalizeWorkSourceRow(row, aliases));
  const grouped = new Map<string, NormalizedWorkSourceRow[]>();
  for (const row of normalized)
    (
      grouped.get(row.logicalKey) ??
      grouped.set(row.logicalKey, []).get(row.logicalKey)!
    ).push(row);
  const canonicalRows: NormalizedWorkSourceRow[] = [];
  const duplicateRows: NormalizedWorkSourceRow[] = [];
  for (const variants of grouped.values()) {
    const sorted = [...variants].sort(
      (a, b) =>
        b.winnerRank - a.winnerRank || b.sourceRowNumber - a.sourceRowNumber,
    );
    canonicalRows.push(sorted[0]);
    duplicateRows.push(...sorted.slice(1));
  }
  const quarantinedRows = canonicalRows.filter(
    (row) =>
      row.issues.some((issue) => issue !== "public_url_missing") ||
      (row.status === "completed" && !row.isPublicUrl),
  );
  const acceptedCandidates = canonicalRows.filter(
    (row) => row.isCountable && !quarantinedRows.includes(row),
  );
  const canonicalUrls = new Set(
    acceptedCandidates.map((row) => `${row.project}|${row.canonicalUrl}`),
  ).size;
  return {
    rows: normalized,
    canonicalRows,
    quarantinedRows,
    duplicateRows,
    diagnostics: {
      rawRows: normalized.length,
      logicalItems: canonicalRows.length,
      canonicalCompletedEvents: canonicalRows.filter((row) => row.isCountable)
        .length,
      quarantinedRows: quarantinedRows.length,
      duplicateVariants: duplicateRows.length,
      projectAliasMerges: normalized.filter(
        (row) =>
          row.project &&
          normalizeAliasKey(row.projectRaw) !== normalizeAliasKey(row.project),
      ).length,
      draftVariantsExcluded: duplicateRows.filter(
        (row) => row.isDraftOrAdminUrl,
      ).length,
      validWorkRecords: acceptedCandidates.length,
      canonicalUrls,
      acceptedCandidates: acceptedCandidates.length,
      needsAttention: quarantinedRows.length,
    },
  };
}
