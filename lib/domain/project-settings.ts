export const projectLifecycles = [
  "new_project",
  "growth_project",
  "stable_project",
] as const;
export type ProjectLifecycle = (typeof projectLifecycles)[number];
export type PerformanceRangeKey = "3m" | "6m" | "all_time";

export type RangeWeights = {
  threeMonth: number | null;
  sixMonth: number | null;
  allTime: number | null;
};

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error("Tên miền chuẩn là bắt buộc.");
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new Error("Tên miền chuẩn phải là hostname hợp lệ.");
  }
  if (!hostname || !hostname.includes(".") || /\s/.test(hostname))
    throw new Error("Tên miền chuẩn phải là hostname hợp lệ.");
  return hostname;
}

export function validateRangeWeights(weights: RangeWeights): RangeWeights {
  const values = [weights.threeMonth, weights.sixMonth, weights.allTime];
  if (values.every((value) => value === null)) return weights;
  if (
    values.some(
      (value) =>
        value === null || !Number.isFinite(value) || value < 0 || value > 100,
    )
  ) {
    throw new Error(
      "Trọng số 3 tháng, 6 tháng và Toàn thời gian phải cùng nằm trong khoảng 0 đến 100, hoặc cùng để trống.",
    );
  }
  const total = values.reduce<number>((sum, value) => sum + Number(value), 0);
  if (Math.abs(total - 100) > 0.0001)
    throw new Error(
      `Tổng trọng số các khoảng Performance phải bằng 100%; hiện là ${total}.`,
    );
  return weights;
}

export function validateProjectSettings(input: {
  projectName: string;
  lifecycle: string;
  canonicalDomain: string;
  gscProperty?: string | null;
  gscReady: boolean;
  kpiReady: boolean;
  weights: RangeWeights;
  version: string;
  effectiveFrom: string;
  reason: string;
  gscVerificationId?: string | number | null;
  includeSubdomains?: boolean;
}) {
  const projectName = input.projectName.trim();
  if (!projectName) throw new Error("Tên dự án là bắt buộc.");
  if (!projectLifecycles.includes(input.lifecycle as ProjectLifecycle))
    throw new Error("Vòng đời dự án không hợp lệ.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
    throw new Error("Ngày bắt đầu hiệu lực phải theo định dạng YYYY-MM-DD.");
  if (!input.version.trim()) throw new Error("Phiên bản cấu hình là bắt buộc.");
  if (!input.reason.trim()) throw new Error("Lý do kiểm toán là bắt buộc.");
  if (input.gscReady && !input.gscProperty?.trim())
    throw new Error(
      "Dự án phải có thuộc tính GSC trước khi được đánh dấu sẵn sàng GSC.",
    );
  if (input.gscReady && !input.gscVerificationId)
    throw new Error(
      "Phải có bằng chứng xác minh GSC trước khi duyệt Cài đặt dự án.",
    );
  return {
    ...input,
    projectName,
    lifecycle: input.lifecycle as ProjectLifecycle,
    canonicalDomain: normalizeDomain(input.canonicalDomain),
    gscProperty: input.gscProperty?.trim() || null,
    version: input.version.trim(),
    reason: input.reason.trim(),
    weights: validateRangeWeights(input.weights),
  };
}

export function registrableDomain(hostname: string) {
  const parts = normalizeDomain(hostname).split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

export function gscPropertyCoversUrl(
  property: string,
  urlOrHostname: string,
  includeSubdomains = false,
) {
  const selected = property.trim();
  const candidate = urlOrHostname.includes("://")
    ? new URL(urlOrHostname)
    : new URL(`https://${urlOrHostname}`);
  const hostname = candidate.hostname.toLowerCase().replace(/^www\./, "");
  if (selected.startsWith("sc-domain:")) {
    const root = normalizeDomain(selected.slice("sc-domain:".length));
    return hostname === root || (includeSubdomains && hostname.endsWith(`.${root}`));
  }
  try {
    const prefix = new URL(selected);
    const prefixHost = prefix.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== prefixHost) return false;
    const prefixPath = prefix.pathname.endsWith("/")
      ? prefix.pathname
      : `${prefix.pathname}/`;
    const candidatePath = candidate.pathname.endsWith("/")
      ? candidate.pathname
      : `${candidate.pathname}/`;
    return candidate.protocol === prefix.protocol && candidatePath.startsWith(prefixPath);
  } catch {
    return false;
  }
}

export function lifecycleMeasurementStrategy(lifecycle: ProjectLifecycle) {
  return lifecycle === "stable_project" ? "stable_audit" : lifecycle;
}
