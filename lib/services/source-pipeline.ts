import { assertUnifiedWriteEnvironment, getMemberEmailMap } from "../env";
import { normalizeAliasKey } from "../domain/normalization";
import { reconcileWorkSourceRows } from "../domain/work-source";
import { getMemberAliases } from "../repositories/member-aliases";
import { getProjectAliases } from "../repositories/project-aliases";
import { getProjectDomainRules } from "../repositories/project-settings";
import {
  compareCanonicalEventCandidates,
  loadPreviewReconciliation,
  persistWorkSourceReconciliation,
} from "../repositories/work-source-rows";
import { getContentUrlsSheetRows } from "../sync/content-urls-sheet";
import { assertUnifiedSchemaReady } from "../schema-readiness";

function previewRows(result: ReturnType<typeof reconcileWorkSourceRows>) {
  return result.canonicalRows.map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    logicalKey: row.logicalKey,
    project: row.project,
    member: row.member,
    workType: row.workType,
    workDate: row.workDate,
    canonicalUrl: row.canonicalUrl,
    observedHostname: row.canonicalUrl ? new URL(row.canonicalUrl).hostname : null,
    classificationStatus:
      row.isCountable && !result.quarantinedRows.includes(row)
        ? "accepted"
        : "quarantined",
    contentKpiEligible: row.isCountable,
    accepted: row.isCountable && !result.quarantinedRows.includes(row),
    issues: row.issues,
  }));
}

export async function previewSourcePipeline(input: {
  accessToken: string;
  actor: string;
}) {
  await assertUnifiedSchemaReady();
  const [projects, projectDomains, dbMembers, sourceRows] = await Promise.all([
    getProjectAliases(),
    getProjectDomainRules(),
    getMemberAliases(),
    getContentUrlsSheetRows(input.accessToken),
  ]);
  const configuredMembers = Object.fromEntries(
    Object.keys(getMemberEmailMap()).map((name) => [
      normalizeAliasKey(name),
      name,
    ]),
  );
  const reconciliation = reconcileWorkSourceRows(sourceRows, {
    projects,
    projectDomains,
    members: { ...configuredMembers, ...dbMembers },
  });
  const diff = await compareCanonicalEventCandidates(reconciliation);
  assertUnifiedWriteEnvironment();
  const persisted = await persistWorkSourceReconciliation(
    reconciliation,
    input.actor,
    { persistEvents: false, previewDiff: diff },
  );
  return {
    ...persisted,
    source: "content_urls_sheet",
    status: "preview_ready",
    rows: previewRows(reconciliation),
  };
}

export async function commitSourcePipeline(input: {
  actor: string;
  approvalReason: string;
  previewRunId: string;
  idempotencyKey: string;
}) {
  await assertUnifiedSchemaReady();
  if (!input.previewRunId?.trim())
    throw new Error("A ready Preview run ID is required.");
  if (!input.idempotencyKey?.trim())
    throw new Error("An idempotency key is required.");
  if (!input.approvalReason?.trim())
    throw new Error(
      "An approval reason is required before canonical work events can be persisted.",
    );
  assertUnifiedWriteEnvironment();
  const preview = await loadPreviewReconciliation(input.previewRunId.trim());
  const persisted = await persistWorkSourceReconciliation(
    preview.result,
    input.actor,
    {
      persistEvents: true,
      approvalReason: input.approvalReason.trim(),
      previewRunId: input.previewRunId.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
      previewDiff: preview.diff,
    },
  );
  return {
    ...persisted,
    source: "content_urls_sheet",
    status: "committed",
    committedFromRunId: input.previewRunId.trim(),
  };
}
