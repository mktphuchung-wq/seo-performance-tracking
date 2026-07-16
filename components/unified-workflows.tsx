"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: `${response.status} ${response.statusText}` }));
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công");
  return data;
}
async function putJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: `${response.status} ${response.statusText}` }));
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công");
  return data;
}
function Result({
  message,
  error,
}: {
  message: string | null;
  error: string | null;
}) {
  return (
    <>
      {message && (
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-emerald-50 p-4 text-xs text-emerald-900">
          {message}
        </pre>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  );
}

export function SourcePipelineControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<null | {
    status: string;
    activeCanonicalUrls: number;
    newEvents: number;
    updatedEvents: number;
    unchangedEvents: number;
    needsAttention: number;
    finishedAt: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson("/api/admin/source-pipeline/refresh", {});
      setSummary(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể làm mới dữ liệu");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">
        Content Sheet → nguồn dữ liệu chuẩn
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Đọc Sheet, chuẩn hóa và ghi event idempotent trong một lần làm mới.
        Hệ thống tự lưu người thực hiện và mã yêu cầu để kiểm toán.
      </p>
      <div className="mt-4">
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={refresh}
        >
          {busy ? "Đang làm mới…" : "Làm mới dữ liệu"}
        </button>
      </div>
      {summary && (
        <div className="mt-4 grid gap-3 rounded-xl bg-emerald-50 p-4 text-sm md:grid-cols-3">
          <p><strong>Trạng thái:</strong> {summary.status}</p>
          <p><strong>Active URL:</strong> {summary.activeCanonicalUrls}</p>
          <p><strong>Event mới:</strong> {summary.newEvents}</p>
          <p><strong>Event cập nhật:</strong> {summary.updatedEvents}</p>
          <p><strong>Không đổi:</strong> {summary.unchangedEvents}</p>
          <p><strong>Cần xử lý:</strong> {summary.needsAttention}</p>
          <p className="md:col-span-3">
            <strong>Hoàn tất:</strong>{" "}
            {new Date(summary.finishedAt).toLocaleString("vi-VN")}
          </p>
        </div>
      )}
      <Result message={null} error={error} />
    </section>
  );
}

export type ProjectOption = {
  project: string;
  approvedGscProperty: string | null;
  canonicalDomain: string | null;
  domainConflict: boolean;
  detectedDomains: Array<{ domain: string; urlCount: number; sampleUrl?: string | null }>;
  current?: {
    lifecycle?: string | null;
    gsc_property?: string | null;
    effective_from?: string | null;
    performance_weight_3m_pct?: number | null;
    performance_weight_6m_pct?: number | null;
    performance_weight_all_time_pct?: number | null;
    gsc_verification_id?: string | number | null;
    gsc_access_status?: string | null;
    include_subdomains?: boolean | null;
    fallback_window_days?: number[] | null;
    minimum_short_window_days?: number | null;
    neutral_score_pct?: number | null;
    confidence_high_factor?: number | null;
    confidence_medium_factor?: number | null;
    confidence_low_factor?: number | null;
    unknown_score_pct?: number | null;
    observed_zero_policy?: {
      under_14_days?: number;
      days_14_to_27?: number;
      days_28_plus?: number;
    } | null;
    gsc_permission_level?: string | null;
    gsc_domain_scope_status?: string | null;
    gsc_test_query_status?: string | null;
    gsc_verification_expires_at?: string | null;
    gsc_verification_error_code?: string | null;
    max_provisional_payable_pct?: number | null;
    pm_review_threshold_pct?: number | null;
    min_eligible_events?: number | null;
    min_known_coverage_pct?: number | null;
    min_post_impressions?: number | null;
    range_fallback_policy?: { renormalize_missing?: boolean; deduplicate_effective_horizon?: boolean } | null;
  } | null;
};
export function ProjectSettingsForm({
  options,
  gscProperties,
  googleAccount,
}: {
  options: ProjectOption[];
  gscProperties: Array<{ siteUrl: string; permissionLevel: string }>;
  googleAccount: {
    email: string;
    tokenError?: string | null;
    tokenExpiresAt?: number | null;
  };
}) {
  const [selectedProject, setSelectedProject] = useState(
    options[0]?.project ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationIds, setVerificationIds] = useState<Record<string, string>>({});
  const [domainSelections, setDomainSelections] = useState<Record<string, string>>({});
  const selected = options.find((option) => option.project === selectedProject);
  const selectedDomain =
    domainSelections[selectedProject] ??
    selected?.canonicalDomain ??
    selected?.detectedDomains[0]?.domain ??
    "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const nullable = (key: string) =>
        form.get(key) === "" ? null : Number(form.get(key));
      const data = await putJson(
        `/api/admin/projects/${encodeURIComponent(selectedProject)}/config`,
        {
          projectName: form.get("projectName"),
          canonicalDomain: form.get("canonicalDomain"),
          lifecycle: form.get("lifecycle"),
          gscProperty: form.get("gscProperty"),
          threeMonthWeight: nullable("threeMonthWeight"),
          sixMonthWeight: nullable("sixMonthWeight"),
          allTimeWeight: nullable("allTimeWeight"),
          effectiveMonth: form.get("effectiveMonth"),
          reason: form.get("reason"),
          approve: form.get("approve") === "on",
          includeSubdomains: form.get("includeSubdomains") === "on",
          fallbackWindows: form.get("fallbackWindows"),
          minimumShortWindowDays: Number(form.get("minimumShortWindowDays")),
          neutralScorePct: Number(form.get("neutralScorePct")),
          confidenceHighFactor: Number(form.get("confidenceHighFactor")),
          confidenceMediumFactor: Number(form.get("confidenceMediumFactor")),
          confidenceLowFactor: Number(form.get("confidenceLowFactor")),
          unknownScorePct: Number(form.get("unknownScorePct")),
          observedZeroPolicy: {
            under14DaysPct: Number(form.get("observedZeroUnder14")),
            days14To27Pct: Number(form.get("observedZero14To27")),
            days28PlusPct: Number(form.get("observedZero28Plus")),
          },
          maxProvisionalPayablePct: Number(form.get("maxProvisionalPayablePct")),
          pmReviewThresholdPct: Number(form.get("pmReviewThresholdPct")),
          minEligibleEvents: Number(form.get("minEligibleEvents")),
          minKnownCoveragePct: Number(form.get("minKnownCoveragePct")),
          minPostImpressions: Number(form.get("minPostImpressions")),
          renormalizeMissing: form.get("renormalizeMissing") === "on",
          deduplicateEffectiveHorizon: form.get("deduplicateEffectiveHorizon") === "on",
          gscVerificationId:
            verificationIds[selectedProject] ??
            selected?.current?.gsc_verification_id ??
            null,
        },
      );
      setMessage(JSON.stringify(data, null, 2));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cấu hình");
    }
  }
  const properties = [
    ...new Set(
      [
        selected?.approvedGscProperty,
        selected?.current?.gsc_property,
        ...gscProperties.map((row) => row.siteUrl),
      ].filter(Boolean),
    ),
  ] as string[];
  const expectedProperty =
    selected?.approvedGscProperty ?? selected?.current?.gsc_property ?? null;
  const propertyAccessible =
    !expectedProperty ||
    gscProperties.some((row) => row.siteUrl === expectedProperty);
  const verified = Boolean(
    verificationIds[selectedProject] ??
      (selected?.current?.gsc_access_status === "verified" &&
        selected?.current?.gsc_verification_id),
  );
  async function verifyGsc(event: React.MouseEvent<HTMLButtonElement>) {
    const formElement = event.currentTarget.form;
    if (!formElement) return;
    const form = new FormData(formElement);
    try {
      const result = await postJson(
        `/api/admin/projects/${encodeURIComponent(selectedProject)}/test-gsc`,
        {
          gscProperty: form.get("gscProperty"),
          includeSubdomains: form.get("includeSubdomains") === "on",
          canonicalDomain: form.get("canonicalDomain"),
        },
      );
      const verificationId = String(result.verification?.id ?? "");
      if (!result.accessible || !result.scopeCovered || !verificationId)
        throw new Error("Xác minh GSC chưa đạt quyền truy cập, phạm vi URL hoặc truy vấn thử.");
      setVerificationIds((current) => ({ ...current, [selectedProject]: verificationId }));
      setMessage("Đã xác minh quyền GSC và lưu bằng chứng kiểm toán.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xác minh GSC");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-6 shadow-sm"
    >
      <h3 className="text-lg font-semibold">Cấu hình dự án</h3>
      <p className="mt-1 text-sm text-slate-600">
        Dự án và tên miền được nhận diện từ dữ liệu đã đồng bộ. Trạng thái sẵn
        sàng và phiên bản được hệ thống xác định tự động.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm">
          Dự án
          <select
            name="projectName"
            value={selectedProject}
            onChange={(event) => setSelectedProject(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {options.map((option) => (
              <option key={option.project}>{option.project}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tên miền chuẩn
          <select
            name="canonicalDomain"
            value={selectedDomain}
            onChange={(event) =>
              setDomainSelections((current) => ({
                ...current,
                [selectedProject]: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
            required
          >
            {selected?.detectedDomains.map((row) => (
              <option key={row.domain} value={row.domain}>
                {row.domain} ({row.urlCount} URLs)
              </option>
            ))}
            {!selected?.detectedDomains.length && selected?.canonicalDomain && (
              <option>{selected.canonicalDomain}</option>
            )}
          </select>
          {selected?.domainConflict && (
            <span className="mt-1 block text-xs text-amber-700">
              Phát hiện nhiều hostname. Hãy chọn rõ phạm vi dự án; hệ thống không tự quyết định theo số URL.
            </span>
          )}
        </label>
        <label className="text-sm">
          Vòng đời
          <select
            key={`lifecycle-${selectedProject}`}
            name="lifecycle"
            defaultValue={selected?.current?.lifecycle ?? "new_project"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
              <option value="new_project">New Growth — dự án mới</option>
              <option value="growth_project">Growth — đang tăng trưởng</option>
              <option value="stable_project">Stable Audit — ổn định</option>
          </select>
        </label>
        <label className="text-sm">
          Thuộc tính GSC
          <select
            key={`gsc-${selectedProject}`}
            name="gscProperty"
            defaultValue={
              selected?.approvedGscProperty ??
              selected?.current?.gsc_property ??
              ""
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="">Chưa chọn</option>
            {properties.map((property) => (
              <option key={property}>{property}</option>
            ))}
          </select>
          {!propertyAccessible && gscProperties.length > 0 && (
            <span className="mt-1 block text-xs text-red-700">
              Phiên Google hiện tại không có quyền với thuộc tính đã cấu hình.
            </span>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeSubdomains"
            defaultChecked={Boolean(selected?.current?.include_subdomains)}
          />
          Cho phép subdomain thuộc phạm vi GSC đã xác minh
        </label>
        <button
          type="button"
          onClick={verifyGsc}
          className="rounded-lg border border-blue-300 px-4 py-2 font-semibold text-blue-700"
        >
          Xác minh quyền GSC
        </button>
        <div className="rounded-xl border bg-slate-50 p-3 text-sm md:col-span-2">
          <p><strong>Tài khoản Google:</strong> {googleAccount.email}</p>
          <p><strong>Permission:</strong> {selected?.current?.gsc_permission_level ?? "Chưa xác minh"}</p>
          <p><strong>Phạm vi:</strong> {selected?.current?.gsc_domain_scope_status ?? "Chưa kiểm tra"}</p>
          <p><strong>Truy vấn thử:</strong> {selected?.current?.gsc_test_query_status ?? "Chưa chạy"}</p>
          <p><strong>Hết hạn xác minh:</strong> {selected?.current?.gsc_verification_expires_at ?? "Chưa có"}</p>
          {(googleAccount.tokenError || selected?.current?.gsc_verification_error_code) && (
            <p className="text-red-700"><strong>Lỗi:</strong> {googleAccount.tokenError ?? selected?.current?.gsc_verification_error_code}</p>
          )}
          <Link
            className="mt-2 inline-block font-semibold text-blue-700 underline"
            href="/api/auth/signin/google?callbackUrl=/admin/projects"
          >
            Đăng nhập lại Google
          </Link>
        </div>
        <p className={`text-sm ${verified ? "text-emerald-700" : "text-amber-700"}`}>
          {verified
            ? "GSC đã xác minh."
            : "GSC chưa xác minh; vẫn có thể duyệt lifecycle/rules. Performance sẽ ở provisional hoặc PM review."}
        </p>
        <Field
          key={`3m-${selectedProject}`}
          name="threeMonthWeight"
          label="Trọng số 3 tháng %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_3m_pct ?? undefined
          }
        />
        <Field
          key={`6m-${selectedProject}`}
          name="sixMonthWeight"
          label="Trọng số 6 tháng %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_6m_pct ?? undefined
          }
        />
        <Field
          key={`all-${selectedProject}`}
          name="allTimeWeight"
          label="Trọng số toàn thời gian %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_all_time_pct ?? undefined
          }
        />
        <Field
          key={`effective-${selectedProject}`}
          name="effectiveMonth"
          label="Tháng hiệu lực"
          type="month"
          required
          defaultValue={
            selected?.current?.effective_from?.slice(0, 7) ??
            new Date().toISOString().slice(0, 7)
          }
        />
        <fieldset className="rounded-xl border p-4 md:col-span-3">
          <legend className="px-2 font-semibold">Quy tắc Hiệu suất có phiên bản</legend>
          <p className="mb-3 text-xs text-slate-600">Các giá trị này được lưu cùng version và ngày hiệu lực để phục vụ kiểm toán payroll.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="fallbackWindows" label="Cửa sổ fallback (ngày, cách nhau bằng dấu phẩy)" defaultValue={selected?.current?.fallback_window_days?.join(",") ?? "28,14,7"} required />
            <Field name="minimumShortWindowDays" label="Cửa sổ ngắn tối thiểu (ngày)" type="number" defaultValue={selected?.current?.minimum_short_window_days ?? 7} required />
            <Field name="neutralScorePct" label="Điểm trung tính %" type="number" defaultValue={selected?.current?.neutral_score_pct ?? 70} required />
            <Field name="confidenceHighFactor" label="Hệ số tin cậy cao (0–1)" type="number" defaultValue={selected?.current?.confidence_high_factor ?? 1} required />
            <Field name="confidenceMediumFactor" label="Hệ số tin cậy trung bình (0–1)" type="number" defaultValue={selected?.current?.confidence_medium_factor ?? 0.7} required />
            <Field name="confidenceLowFactor" label="Hệ số tin cậy thấp (0–1)" type="number" defaultValue={selected?.current?.confidence_low_factor ?? 0.35} required />
            <Field name="unknownScorePct" label="Điểm khi không thể quan sát %" type="number" defaultValue={selected?.current?.unknown_score_pct ?? 70} required />
            <Field name="observedZeroUnder14" label="Observed zero dưới 14 ngày %" type="number" defaultValue={selected?.current?.observed_zero_policy?.under_14_days ?? 70} required />
            <Field name="observedZero14To27" label="Observed zero 14–27 ngày %" type="number" defaultValue={selected?.current?.observed_zero_policy?.days_14_to_27 ?? 55} required />
            <Field name="observedZero28Plus" label="Observed zero từ 28 ngày %" type="number" defaultValue={selected?.current?.observed_zero_policy?.days_28_plus ?? 40} required />
            <Field name="maxProvisionalPayablePct" label="Trần điểm tạm tính %" type="number" defaultValue={selected?.current?.max_provisional_payable_pct ?? 70} required />
            <Field name="pmReviewThresholdPct" label="Ngưỡng PM cần đánh giá %" type="number" defaultValue={selected?.current?.pm_review_threshold_pct ?? 55} required />
            <Field name="minEligibleEvents" label="Event tối thiểu" type="number" defaultValue={selected?.current?.min_eligible_events ?? 1} required />
            <Field name="minKnownCoveragePct" label="Độ phủ biết được tối thiểu %" type="number" defaultValue={selected?.current?.min_known_coverage_pct ?? 60} required />
            <Field name="minPostImpressions" label="Lượt hiển thị sau event tối thiểu" type="number" defaultValue={selected?.current?.min_post_impressions ?? 0} required />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="renormalizeMissing" defaultChecked={selected?.current?.range_fallback_policy?.renormalize_missing ?? true} />Chuẩn hóa lại trọng số khi thiếu kỳ</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="deduplicateEffectiveHorizon" defaultChecked={selected?.current?.range_fallback_policy?.deduplicate_effective_horizon ?? true} />Loại trùng cùng cửa sổ hiệu lực</label>
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="approve" />
          Duyệt phiên bản này
        </label>
        <label className="text-sm md:col-span-3">
          Lý do kiểm toán (bắt buộc khi thay đổi/ghi đè)
          <textarea
            name="reason"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>
      <button className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        Lưu cấu hình dự án
      </button>
      <Result message={message} error={error} />
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

export function PerformanceRefreshControl({
  defaultMonth,
}: {
  defaultMonth: string;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    try {
      setError(null);
      setMessage(
        JSON.stringify(
          await postJson("/api/admin/performance/refresh", { month }),
          null,
          2,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể làm mới Hiệu suất");
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Tháng chốt dữ liệu
          <input
            className="mt-1 block rounded-lg border px-3 py-2"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <button
          onClick={run}
          className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"
        >
          Làm mới dữ liệu Hiệu suất
        </button>
      </div>
      <Result message={message} error={error} />
    </section>
  );
}

export type ReviewCriterion = {
  criterionKey: string;
  label: string;
  allowsNa: boolean;
  initialScore?: number | null;
  initialIsNa?: boolean;
  initialNaReason?: string | null;
  initialNote?: string | null;
};
export function QualityReviewEditor({
  month,
  workEventId,
  criteria,
  initialAdminNote,
}: {
  month: string;
  workEventId: string;
  criteria: ReviewCriterion[];
  initialAdminNote?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const answers = criteria.map((criterion, index) => {
        const isNa = form.get(`na-${index}`) === "on";
        const note = String(form.get(`note-${index}`) ?? "");
        const rawScore = String(form.get(`score-${index}`) ?? "");
        if (!isNa && rawScore === "")
          throw new Error(`Chưa chấm điểm: ${criterion.label}`);
        return {
          criterionKey: criterion.criterionKey,
          score: isNa ? null : Number(rawScore),
          isNa,
          naReason: isNa ? note : undefined,
          note,
          evidence: note,
        };
      });
      const data = await postJson("/api/admin/member-review/reviews", {
        month,
        workEventId,
        criteria: answers,
        status: "approved",
        adminNote: form.get("adminNote"),
      });
      setMessage(
        `Đã lưu ${Number(data.reviews?.[0]?.qualityPct ?? 0).toFixed(1)}%`,
      );
      setError(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu đánh giá");
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {criteria.map((criterion, index) => (
          <label className="text-xs" key={criterion.criterionKey}>
            {criterion.label}
            <select
              name={`score-${index}`}
              className="mt-1 w-full rounded border px-2 py-1"
              defaultValue={
                criterion.initialScore === null ||
                criterion.initialScore === undefined
                  ? ""
                  : String(criterion.initialScore)
              }
            >
              <option value="">Chọn điểm</option>
              <option value="5">5 — Xuất sắc</option>
              <option value="4">4 — Đạt tốt</option>
              <option value="3">3 — Chấp nhận được</option>
              <option value="2">2 — Yếu</option>
              <option value="1">1 — Kém</option>
              <option value="0">0 — Thiếu</option>
            </select>
            {criterion.allowsNa && (
              <span className="mt-1 flex items-center gap-2">
                <input
                  name={`na-${index}`}
                  type="checkbox"
                  defaultChecked={criterion.initialIsNa}
                />
                Không áp dụng (bắt buộc nêu lý do)
              </span>
            )}
            <input
              name={`note-${index}`}
              className="mt-1 w-full rounded border px-2 py-1"
              defaultValue={
                criterion.initialIsNa
                  ? criterion.initialNaReason ?? criterion.initialNote ?? ""
                  : criterion.initialNote ?? ""
              }
              placeholder="Bằng chứng cho điểm thấp hoặc lý do N/A"
            />
          </label>
        ))}
      </div>
      <textarea
        name="adminNote"
        className="mt-3 w-full rounded border px-3 py-2 text-sm"
        defaultValue={initialAdminNote ?? ""}
        placeholder="Ghi chú của người đánh giá"
      />
      <button className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
        Duyệt đánh giá URL
      </button>
      <Result message={message} error={error} />
    </form>
  );
}

export function TargetForm({
  month,
  members,
  selectedMember,
}: {
  month: string;
  members: string[];
  selectedMember?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await putJson("/api/admin/member-review/target", {
        month,
        memberName: form.get("memberName"),
        targetUnits: Number(form.get("targetUnits")),
        baseTargetUnits: Number(form.get("baseTargetUnits")),
        activeWorkdayRatio: Number(form.get("activeWorkdayRatio")),
        adjustmentReason: form.get("adjustmentReason"),
      });
      setMessage(JSON.stringify(data, null, 2));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu target");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">Min post / đơn vị target theo Thành viên × Tháng</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Thành viên
          <select
            name="memberName"
            defaultValue={selectedMember}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {members.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Field name="targetUnits" label="Đơn vị target" type="number" required />
        <Field
          name="baseTargetUnits"
          label="Target cơ sở"
          type="number"
          required
        />
        <Field
          name="activeWorkdayRatio"
          label="Tỷ lệ ngày làm việc (0–1)"
          type="number"
          required
        />
        <Field name="adjustmentReason" label="Lý do điều chỉnh" />
      </div>
      <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        Lưu target thành viên
      </button>
      <Result message={message} error={error} />
    </form>
  );
}

export function MemberKpiConfigForm({
  month,
  members,
  selectedMember,
  initialConfig,
}: {
  month: string;
  members: string[];
  selectedMember?: string;
  initialConfig?: {
    socialVideoEnabled: boolean;
    locked: boolean;
    weights: {
      seoContent: number;
      seoPerformance: number;
      socialVideo: number;
    };
  };
}) {
  const [socialEnabled, setSocialEnabled] = useState(
    initialConfig?.socialVideoEnabled ?? false,
  );
  const [contentWeight, setContentWeight] = useState(
    initialConfig ? String(initialConfig.weights.seoContent) : "",
  );
  const [performanceWeight, setPerformanceWeight] = useState(
    initialConfig ? String(initialConfig.weights.seoPerformance) : "",
  );
  const [socialWeight, setSocialWeight] = useState(
    initialConfig ? String(initialConfig.weights.socialVideo) : "0",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total =
    Number(contentWeight || 0) +
    Number(performanceWeight || 0) +
    Number(socialWeight || 0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await putJson("/api/admin/kpi-close/config", {
        month,
        memberName: form.get("memberName"),
        socialVideoEnabled: socialEnabled,
        weights: {
          seoContent: Number(contentWeight),
          seoPerformance: Number(performanceWeight),
          socialVideo: Number(socialWeight),
        },
        reason: form.get("reason"),
        approve: true,
      });
      setMessage(JSON.stringify(data, null, 2));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cấu hình");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">Cấu hình KPI cuối cùng theo Thành viên × Tháng</h3>
      <p className="mt-1 text-sm text-slate-600">
        Trọng số được quản lý phiên bản riêng cho thành viên này và phải đủ 100%.
        Cấu hình đã khóa phải được mở lại trước khi chỉnh sửa.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Thành viên
          <select
            name="memberName"
            defaultValue={selectedMember}
            disabled={Boolean(selectedMember)}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {members.map((member) => (
              <option key={member}>{member}</option>
            ))}
          </select>
          {selectedMember && (
            <input type="hidden" name="memberName" value={selectedMember} />
          )}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={socialEnabled}
            onChange={(event) => {
              setSocialEnabled(event.target.checked);
              if (!event.target.checked) setSocialWeight("0");
            }}
          />
          Bật Social + Video
        </label>
        <span
          className={`self-end rounded px-3 py-2 text-sm ${total === 100 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          Tổng: {total}%
        </span>
        <label className="text-sm">
          SEO Nội dung %
          <input
            type="number"
            min="0"
            max="100"
            value={contentWeight}
            onChange={(event) => setContentWeight(event.target.value)}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          SEO Hiệu suất %
          <input
            type="number"
            min="0"
            max="100"
            value={performanceWeight}
            onChange={(event) => setPerformanceWeight(event.target.value)}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Social + Video %
          <input
            type="number"
            min="0"
            max="100"
            value={socialWeight}
            onChange={(event) => setSocialWeight(event.target.value)}
            disabled={!socialEnabled}
            required
            className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
          />
        </label>
        <label className="text-sm md:col-span-3">
          Lý do cấu hình
          <textarea
            name="reason"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
      </div>
      <button
        disabled={total !== 100 || initialConfig?.locked}
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {initialConfig?.locked
          ? "Mở phiên bản đã khóa để chỉnh sửa"
          : "Duyệt cấu hình thành viên"}
      </button>
      <Result message={message} error={error} />
    </form>
  );
}

export function KpiCloseControls({
  month,
  members,
  lockedResults = [],
}: {
  month: string;
  members: string[];
  lockedResults?: Array<{ id: string; memberName: string }>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function call(
    path: string,
    body: unknown = {},
    method: "POST" | "PUT" = "POST",
  ) {
    try {
      setError(null);
      const data =
        method === "PUT"
          ? await putJson(path, body)
          : await postJson(path, body);
      setMessage(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác không thành công");
    }
  }
  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold">Xem trước KPI cuối cùng</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          <select id="preview-member" className="rounded border px-3 py-2">
            {members.map((member) => (
              <option key={member}>{member}</option>
            ))}
          </select>
          <button
            onClick={() =>
              call("/api/admin/kpi-close/preview", {
                month,
                memberName: (
                  document.getElementById("preview-member") as HTMLSelectElement
                ).value,
              })
            }
            className="rounded-lg border px-4 py-2 font-semibold"
          >
            Tính cho thành viên đã chọn
          </button>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Social + Video</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <select id="social-member" className="rounded border px-3 py-2">
            {members.map((member) => (
              <option key={member}>{member}</option>
            ))}
          </select>
          <input
            id="social-score"
            type="number"
            min="0"
            max="100"
            className="rounded border px-3 py-2"
            placeholder="Điểm 0–100"
          />
          <label className="flex items-center gap-2 text-sm">
            <input id="social-na" type="checkbox" />
            N/A
          </label>
          <input
            id="social-reason"
            className="rounded border px-3 py-2"
            placeholder="Ghi chú, bằng chứng hoặc lý do N/A"
          />
        </div>
        <button
          onClick={() => {
            const memberName = (
              document.getElementById("social-member") as HTMLSelectElement
            ).value;
            const isNotApplicable = (
              document.getElementById("social-na") as HTMLInputElement
            ).checked;
            const raw = (
              document.getElementById("social-score") as HTMLInputElement
            ).value;
            const reason = (
              document.getElementById("social-reason") as HTMLInputElement
            ).value;
            call(
              "/api/admin/kpi-close/social",
              {
                month,
                memberName,
                scorePct: isNotApplicable ? null : Number(raw),
                isNotApplicable,
                reason,
                evidence: { note: reason },
              },
              "PUT",
            );
          }}
          className="mt-3 rounded-lg border px-4 py-2 font-semibold"
        >
          Lưu Social + Video
        </button>
      </div>
      <div>
        <h3 className="font-semibold">Chốt và khóa</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <select id="close-member" className="rounded border px-3 py-2">
            {members.map((member) => (
              <option key={member}>{member}</option>
            ))}
          </select>
          <input
            id="close-reason"
            className="rounded border px-3 py-2"
            placeholder="Lý do xác nhận khi thiếu dữ liệu Hiệu suất"
          />
          <button
            onClick={() => {
              const memberName = (
                document.getElementById("close-member") as HTMLSelectElement
              ).value;
              const reason = (
                document.getElementById("close-reason") as HTMLInputElement
              ).value;
              call("/api/admin/kpi-close/finalize", {
                month,
                memberName,
                acknowledgeMissingPerformance: Boolean(reason),
                missingPerformanceReason: reason,
              });
            }}
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"
          >
            Chốt và khóa
          </button>
        </div>
      </div>
      {lockedResults.length > 0 && (
        <div>
          <h3 className="font-semibold">Mở lại phiên bản đã khóa</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <select id="reopen-result" className="rounded border px-3 py-2">
              {lockedResults.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.memberName} — #{row.id}
                </option>
              ))}
            </select>
            <input
              id="reopen-reason"
              className="rounded border px-3 py-2"
              placeholder="Lý do được phép mở lại"
            />
            <button
              onClick={() =>
                call("/api/admin/kpi-close/reopen", {
                  month,
                  resultId: (
                    document.getElementById(
                      "reopen-result",
                    ) as HTMLSelectElement
                  ).value,
                  reason: (
                    document.getElementById("reopen-reason") as HTMLInputElement
                  ).value,
                })
              }
              className="rounded-lg border border-amber-300 px-4 py-2 font-semibold text-amber-800"
            >
              Mở lại thành phiên bản mới
            </button>
          </div>
        </div>
      )}
      <Result message={message} error={error} />
    </section>
  );
}
