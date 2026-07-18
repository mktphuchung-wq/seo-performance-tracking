import {
  listAdminOverviewFilters,
  loadAdminOverview,
  type AdminOverviewFilters,
} from "../repositories/admin-overview";

const finite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export async function getAdminOverview(input: AdminOverviewFilters) {
  const [data, options] = await Promise.all([
    loadAdminOverview(input),
    listAdminOverviewFilters(),
  ]);
  const summary = {
    eventCount: finite(data.summary.event_count),
    urlCount: finite(data.summary.url_count),
    payableWorkUnits: finite(data.summary.payable_work_units),
    approvedReviews: finite(data.summary.approved_reviews),
    pendingReviews: finite(data.summary.pending_reviews),
    fetchErrors: finite(data.summary.fetch_errors),
    observedZero: finite(data.summary.observed_zero),
    missingData: finite(data.summary.missing_data),
    tooNewOrReview: finite(data.summary.too_new_or_review),
  };
  const warnings = [
    summary.fetchErrors
      ? { code: "gsc_fetch_error", count: summary.fetchErrors, href: "/admin/data-source?status=fetch_error" }
      : null,
    summary.missingData
      ? { code: "gsc_missing", count: summary.missingData, href: "/admin/data-source?status=not_fetched" }
      : null,
    summary.tooNewOrReview
      ? { code: "performance_review", count: summary.tooNewOrReview, href: "/admin/member-performance" }
      : null,
    summary.pendingReviews
      ? { code: "quality_pending", count: summary.pendingReviews, href: "/admin/member-review" }
      : null,
  ].filter(Boolean);
  const dataThrough =
    data.summary.data_through ?? data.freshness.gsc_data_through ?? null;
  return {
    generatedAt: new Date().toISOString(),
    dataThrough,
    freshness: data.freshness,
    filters: {
      month: input.month.slice(0, 7),
      project: input.project ?? null,
      member: input.member ?? null,
      options,
    },
    summary,
    projects: data.projects,
    members: data.members,
    warnings,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
