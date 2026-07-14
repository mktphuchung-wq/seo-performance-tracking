"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { auditUpdateRubricV2, newContentRubricV2 } from "../../lib/kpi/rubrics";
import { uiLabel } from "../../lib/ui-labels";

type Audit = Record<string, any>;
type Notice = { kind: "success" | "error" | "info"; message: string; requestId?: string | null } | null;

const pct = (value: unknown) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const number = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const money = (value: unknown) => value === null || value === undefined ? "N/A" : `${new Intl.NumberFormat("vi-VN").format(Number(value))} VND`;
const key = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function errorHelp(code: string | undefined) {
  if (code === "KPI_SCHEMA_MISSING") return "Hãy áp dụng migration hoàn thiện trên nhánh staging riêng.";
  if (code === "KPI_ENGINE_DISABLED") return "Chỉ bật KPI_ENGINE_V2 trong môi trường preview.";
  if (code === "GOOGLE_ACCESS_TOKEN_MISSING") return "Hãy đăng xuất rồi đăng nhập lại và cấp quyền Google.";
  if (code === "KPI_WORKFLOW_ERROR") return "Kiểm tra chỉ tiêu, đánh giá, ánh xạ GSC, cấu hình vòng đời và mã yêu cầu audit.";
  return "Khắc phục điều kiện tiên quyết được nêu và thử lại.";
}

export function KpiMonthWorkspace({ month, memberName, initialAudit, initialPreview, featureEnabled }: { month: string; memberName?: string; initialAudit: Audit; initialPreview?: any; featureEnabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [actionResult, setActionResult] = useState<any>(null);
  const [approvalReason, setApprovalReason] = useState("Đã đánh giá và phê duyệt đối soát staging để tính toán shadow");
  const [targetUnits, setTargetUnits] = useState(String(initialAudit.targets?.find((row: any) => row.member_name === memberName)?.target_units ?? (memberName === "Hướng Dương" ? 22 : 14)));
  const [manualScores, setManualScores] = useState<Record<string, string>>(() => Object.fromEntries(
    (initialAudit.componentDefinitions ?? []).filter((row: any) => row.is_controllable).map((row: any) => [row.component_key, String(initialAudit.components?.find((score: any) => score.component_key === row.component_key && (!memberName || score.member_name === memberName))?.payable_pct ?? (row.component_key === "discipline" ? 100 : 90))])
  ));
  const [missingPerformanceReason, setMissingPerformanceReason] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [criterionScores, setCriterionScores] = useState<Record<string, number | "na">>({});
  const [reviewNote, setReviewNote] = useState("Người đánh giá đã kiểm tra URL theo rubric đang áp dụng.");
  const [shadowSheetValues, setShadowSheetValues] = useState<Record<string, string>>(() => Object.fromEntries((initialAudit.differences ?? []).map((row: any) => [row.component_key, row.sheet_value === null ? "" : String(row.sheet_value)])));
  const [shadowExplanations, setShadowExplanations] = useState<Record<string, string>>(() => Object.fromEntries((initialAudit.differences ?? []).map((row: any) => [row.component_key, row.explanation ?? ""])));
  const [shadowSourceUrls, setShadowSourceUrls] = useState<Record<string, string>>(() => Object.fromEntries((initialAudit.differences ?? []).map((row: any) => [row.component_key, row.source_url ?? ""])));

  const members = initialAudit.members ?? [];
  const events = (initialAudit.events ?? []).filter((row: any) => !memberName || row.member_name === memberName);
  const target = initialAudit.targets?.find((row: any) => row.member_name === memberName) ?? null;
  const components = useMemo(() => Object.fromEntries((initialAudit.components ?? []).filter((row: any) => !memberName || row.member_name === memberName).map((row: any) => [row.component_key, row])), [initialAudit.components, memberName]);
  const manualDefinitions = (initialAudit.componentDefinitions ?? []).filter((row: any) => row.is_controllable);
  const performanceRows = (initialAudit.performance ?? []).filter((row: any) => !memberName || row.member_name === memberName);
  const workflow = initialAudit.workflow?.find((row: any) => row.member_name === memberName);
  const locked = initialAudit.results?.find((row: any) => row.member_name === memberName && row.status === "locked");
  const preview = actionResult?.calculation?.results?.[0]?.preview ?? initialPreview ?? locked;
  const seoDiagnostics = components.seo_content?.diagnostics ?? {};
  const reviewed = events.filter((row: any) => row.review_status === "approved").length;
  const resolved = events.filter((row: any) => row.review_status === "approved" || (row.review_status === "excluded" && (row.exclusion_reason || row.admin_note))).length;
  const qualityCoverage = events.length ? resolved / events.length * 100 : null;
  const readOnly = Boolean(locked);

  async function post(path: string, body?: Record<string, unknown>, useIdempotency = true) {
    setNotice({ kind: "info", message: "Đang chạy quy trình staging…" });
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(useIdempotency ? { "Idempotency-Key": key() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload.error ?? {};
      throw Object.assign(new Error(`${error.message ?? "Thao tác quy trình thất bại"} ${errorHelp(error.code)}`), { requestId: error.requestId });
    }
    setActionResult(payload);
    setNotice({ kind: "success", message: payload.replayed ? "Đã hoàn tất từ phản hồi idempotent được lưu." : "Thao tác quy trình đã hoàn tất.", requestId: payload.requestId });
    startTransition(() => router.refresh());
    return payload;
  }

  function run(action: () => Promise<unknown>) {
    action().catch((error: any) => setNotice({ kind: "error", message: error.message, requestId: error.requestId ?? null }));
  }

  function chooseEvent(event: any) {
    const rubric = event.work_type === "new_content" ? newContentRubricV2 : auditUpdateRubricV2;
    setSelectedEvent(event);
    setCriterionScores(Object.fromEntries(rubric.criteria.map((criterion) => [criterion.key, 4])));
  }

  async function saveReview(status: "approved" | "excluded") {
    if (!selectedEvent || !memberName) return;
    const rubric = selectedEvent.work_type === "new_content" ? newContentRubricV2 : auditUpdateRubricV2;
    const review = status === "approved" ? {
      workEventId: selectedEvent.work_event_id,
      status,
      criteria: rubric.criteria.map((criterion) => criterionScores[criterion.key] === "na"
        ? ({ criterionKey: criterion.key, score: null, isNa: true, naReason: reviewNote, note: reviewNote, evidence: selectedEvent.canonical_url_snapshot })
        : ({ criterionKey: criterion.key, score: criterionScores[criterion.key] ?? 4, note: reviewNote, evidence: selectedEvent.canonical_url_snapshot })),
      adminNote: reviewNote,
      evidence: { url: selectedEvent.canonical_url_snapshot },
    } : { workEventId: selectedEvent.work_event_id, status, criteria: [], exclusionReason: reviewNote };
    await post(`/api/admin/kpi-month/${month}/reviews`, { memberName, reviews: [review] });
    setSelectedEvent(null);
  }

  async function saveShadow() {
    if (!memberName) return;
    const rows = ["discipline", "seo_content", "seo_performance", "social_video"].map((componentKey) => {
      const v2Value = componentKey === "discipline" ? number(components.discipline?.payable_pct) : componentKey === "social_video" ? number(components.social_video?.payable_pct) : number(components[componentKey]?.payable_pct);
      const sheetValue = number(shadowSheetValues[componentKey]);
      const delta = sheetValue === null || v2Value === null ? null : v2Value - sheetValue;
      return { componentKey, sheetValue, v2Value, sourceUrl: shadowSourceUrls[componentKey] || null, ruleVersion: components[componentKey]?.rule_version ?? "manual_component_v2", explanationCategory: delta === 0 ? "matched" : shadowExplanations[componentKey] ? (shadowSourceUrls[componentKey] ? "url_and_rule" : "rule") : null, explanation: delta === 0 ? "Các giá trị khớp nhau." : shadowExplanations[componentKey] || null, evidence: { memberName, month, componentSourceIds: components[componentKey]?.source_ids ?? [] } };
    });
    await post(`/api/admin/kpi-month/${month}/shadow`, { memberName, rows });
  }

  return <div className="space-y-6">
    {!featureEnabled && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Chế độ shadow chỉ đọc:</strong> KPI_ENGINE_V2_ENABLED đang tắt. Chỉ bật trên staging sau khi xác minh kết nối cơ sở dữ liệu.</div>}
    {notice && <div role="status" className={`rounded-xl border p-4 text-sm ${notice.kind === "error" ? "border-red-300 bg-red-50 text-red-950" : notice.kind === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-blue-200 bg-blue-50 text-blue-950"}`}>
      {notice.message}{notice.requestId && <span className="ml-2 font-mono text-xs">Mã yêu cầu {notice.requestId}</span>}
    </div>}

    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-64 text-sm font-semibold">Thành viên
          <select aria-label="Thành viên" className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal" value={memberName ?? ""} onChange={(event) => router.push(`/admin/kpi-month/${month}?member=${encodeURIComponent(event.target.value)}`)}>
            <option value="" disabled>Chọn thành viên</option>
            {members.map((member: any) => <option key={member.member_name} value={member.member_name}>{member.member_name} ({member.event_count ?? 0} sự kiện)</option>)}
          </select>
        </label>
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm"><span className="text-slate-500">Quy trình</span><strong className="ml-2">{uiLabel(workflow?.state ?? "draft")}</strong></div>
        {locked && <div className="rounded-lg bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">Đã khóa v{locked.version} · chỉ đọc</div>}
      </div>
    </section>

    {memberName ? <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Thực tế / Chỉ tiêu" value={`${seoDiagnostics.actualUnits ?? "N/A"} / ${target?.target_units ?? "N/A"}`} />
        <Metric label="Số lượng" value={pct(seoDiagnostics.quantityPct ?? components.seo_content?.diagnostics?.quantityPct)} />
        <Metric label="Chất lượng" value={`${pct(seoDiagnostics.qualityPct)} · ${pct(qualityCoverage)}`} />
        <Metric label="SEO Content" value={pct(components.seo_content?.payable_pct)} />
        <Metric label="Performance" value={`${pct(components.seo_performance?.payable_pct)} · ${uiLabel(components.seo_performance?.status, "N/A")}`} />
        <Metric label="Kết quả cuối / Chi trả" value={`${pct(preview?.payablePct ?? preview?.payable_pct)} · ${money(preview?.payoutVnd ?? preview?.payout_vnd)}`} />
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold">Quy trình theo tháng</h3>
        <p className="mt-1 text-sm text-slate-600">Mỗi thao tác hiển thị điều kiện tiên quyết và lưu mã yêu cầu/lần chạy. Chức năng ghi trên production bị chặn cho đến khi được phê duyệt.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Action title="1. Chạy thử đối soát" help="Chỉ đọc Sheet; kiểm tra dữ liệu cách ly, bản trùng và chẩn đoán." disabled={pending} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/sync?dryRun=true`, undefined, false))} />
          <Action title="2. Lưu bằng chứng thô" help="Chỉ dành cho staging; lưu các biến thể thô nhưng chưa tạo sự kiện được tính chi trả." disabled={pending || readOnly || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/sync?dryRun=false&stage=raw`))} />
          <div className="rounded-xl border p-3"><label className="text-xs font-semibold">Lý do phê duyệt sự kiện chuẩn hóa<textarea className="mt-1 w-full rounded border p-2 text-sm" value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} /></label><button disabled={pending || readOnly || !featureEnabled || !approvalReason.trim()} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/sync?dryRun=false&stage=events&approvalReason=${encodeURIComponent(approvalReason)}`))} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">3. Lưu sự kiện đã duyệt</button></div>
          <Action title="6. Làm mới Performance đủ trưởng thành" help="Sử dụng tháng đo lường, mốc GSC, vòng đời, nhóm đối chứng và phân loại tính khả dụng." disabled={pending || readOnly || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/performance`, { memberName }))} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); run(() => post(`/api/admin/kpi-month/${month}/targets`, { memberName, targetUnits: Number(targetUnits), baseTargetUnits: Number(targetUnits), activeWorkdayRatio: 1 })); }}>
          <h3 className="font-bold">Chỉ tiêu thành viên theo tháng</h3><p className="mt-1 text-sm text-slate-600">Một chỉ tiêu payroll cho tất cả dự án; phân bổ theo dự án chỉ là chẩn đoán tùy chọn.</p>
          <label className="mt-4 block text-sm">Đơn vị chỉ tiêu<input aria-label="Đơn vị chỉ tiêu" type="number" min="0" step="0.25" className="mt-1 w-full rounded-lg border px-3 py-2" value={targetUnits} onChange={(event) => setTargetUnits(event.target.value)} /></label>
          <button disabled={pending || readOnly || !featureEnabled} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Lưu chỉ tiêu</button>
        </form>
        <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); run(async () => { for (const definition of manualDefinitions) await post(`/api/admin/kpi-month/${month}/components`, { memberName, componentKey: definition.component_key, scorePct: Number(manualScores[definition.component_key]), reason: "Phê duyệt quản trị theo tháng" }); }); }}>
          <h3 className="font-bold">Thành phần nhập thủ công</h3><div className="mt-4 grid grid-cols-2 gap-3">{manualDefinitions.map((definition: any) => <label className="text-sm" key={definition.component_key}>{uiLabel(definition.component_key)} ({definition.default_weight_pct}%)<input aria-label={`Điểm ${uiLabel(definition.component_key)}`} type="number" min="0" max="100" className="mt-1 w-full rounded-lg border px-3 py-2" value={manualScores[definition.component_key] ?? ""} onChange={(event) => setManualScores((current) => ({ ...current, [definition.component_key]: event.target.value }))} /></label>)}</div>
          <button disabled={pending || readOnly || !featureEnabled} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Phê duyệt điểm thủ công</button>
        </form>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-bold">Hàng chờ đánh giá URL / sự kiện công việc</h3><p className="text-sm text-slate-600">{reviewed} đã duyệt · {resolved}/{events.length} đã xử lý · Kết quả cuối yêu cầu độ phủ 100%.</p></div></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Dự án</th><th>Loại / ngày</th><th>Trạng thái</th><th>Đơn vị / quy tắc</th><th>Đánh giá</th><th></th></tr></thead><tbody>
          {events.map((event: any) => <tr className="border-t" key={event.work_event_id}><td className="max-w-sm p-3"><a className="break-all text-blue-700 underline" href={event.canonical_url_snapshot} target="_blank" rel="noreferrer">{event.canonical_url_snapshot}</a><div className="mt-1 font-mono text-xs text-slate-500">{event.source_item_id ?? event.work_event_id}</div></td><td>{event.project}</td><td>{uiLabel(event.work_type)}<br/><span className="text-slate-500">{event.work_date}</span></td><td>{uiLabel(event.status)}</td><td>{event.unit_value}<br/><span className="text-xs text-slate-500">{event.unit_rule_version ?? "N/A"}</span></td><td>{uiLabel(event.review_status ?? "pending")}<br/>{pct(event.quality_pct)}</td><td><button disabled={readOnly} onClick={() => chooseEvent(event)} className="rounded border px-3 py-1 font-semibold disabled:opacity-40">Đánh giá</button></td></tr>)}
          {!events.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Không có sự kiện công việc cho thành viên/tháng này. Trạng thái này khác với lỗi truy vấn.</td></tr>}
        </tbody></table></div>
      </section>

      {selectedEvent && <section role="dialog" aria-label="Đánh giá chất lượng" className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 shadow-sm"><div className="flex justify-between"><div><h3 className="font-bold">Đánh giá {uiLabel(selectedEvent.work_type)}</h3><p className="text-sm text-slate-600">{selectedEvent.canonical_url_snapshot}</p></div><button onClick={() => setSelectedEvent(null)}>Đóng</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(selectedEvent.work_type === "new_content" ? newContentRubricV2 : auditUpdateRubricV2).criteria.map((criterion) => <label className="rounded-lg bg-white p-3 text-sm" key={criterion.key}>{criterion.name} ({criterion.weightPct}%)<select className="mt-2 w-full rounded border p-2" value={criterionScores[criterion.key] ?? 4} onChange={(event) => setCriterionScores((current) => ({ ...current, [criterion.key]: event.target.value === "na" ? "na" : Number(event.target.value) }))}>{[0,1,2,3,4,5].map((score) => <option key={score} value={score}>{score}</option>)}{criterion.allowsNa && <option value="na">N/A</option>}</select></label>)}</div><label className="mt-4 block text-sm">Bằng chứng / lý do<textarea className="mt-1 w-full rounded-lg border p-3" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><p className="mt-2 text-xs text-slate-600">Điểm 0–2, N/A và trường hợp loại trừ bắt buộc có bằng chứng/lý do này. Chỉ dùng N/A khi rubric hiện hành cho phép.</p><div className="mt-3 flex gap-3"><button onClick={() => run(() => saveReview("approved"))} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Phê duyệt đánh giá</button><button onClick={() => run(() => saveReview("excluded"))} className="rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-700">Loại trừ kèm lý do</button></div></section>}

      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Nhóm đo lường Performance</h3><div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Dự án</th><th>Chiến lược</th><th>Điểm / trạng thái</th><th>Đơn vị trưởng thành / ứng viên</th><th>Độ phủ</th><th>Tính khả dụng / lỗi</th><th>Mốc dữ liệu / quy tắc</th></tr></thead><tbody>{performanceRows.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3">{row.project}</td><td>{uiLabel(row.strategy)}</td><td>{pct(row.payable_pct)} · {uiLabel(row.status)}</td><td>{row.mature_event_units} / {row.candidate_event_units}</td><td>{pct(row.coverage_pct)}</td><td>{uiLabel(row.availability_reason ?? "available")}<br/><span className="text-red-700">{uiLabel(row.error_category)}</span></td><td>{row.data_as_of ?? "N/A"}<br/>{row.rule_version}</td></tr>)}{!performanceRows.length && <tr><td colSpan={7} className="p-4 text-slate-500">Performance chưa được làm mới cho nhóm đo lường đủ trưởng thành.</td></tr>}</tbody></table></div></section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Tính toán, xem trước và khóa</h3><div className="mt-4 flex flex-wrap gap-3"><button disabled={pending || readOnly || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/calculate`, { memberName }))} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-40">Tính bản xem trước</button><label className="min-w-80 flex-1 text-sm">Xác nhận Performance N/A (không áp dụng cho lỗi hệ thống)<input className="mt-1 w-full rounded-lg border px-3 py-2" value={missingPerformanceReason} onChange={(event) => setMissingPerformanceReason(event.target.value)} placeholder="Lý do của PM cho N/A hợp lệ / chưa đủ dữ liệu" /></label><button disabled={pending || readOnly || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/finalize`, { memberName, acknowledgeMissingPerformance: Boolean(missingPerformanceReason.trim()), missingPerformanceReason: missingPerformanceReason || null }))} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Hoàn tất và khóa snapshot shadow</button>{locked && <button disabled={pending || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/reopen`, { memberName, resultId: String(locked.id), reason: "Hiệu chỉnh được ủy quyền sau khi đánh giá snapshot đã khóa" }))} className="rounded-lg border border-amber-400 px-4 py-2 font-semibold text-amber-900">Mở lại thành phiên bản mới</button>}</div></section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">So sánh shadow với Google Sheets và bằng chứng phê duyệt</h3><p className="mt-1 text-sm text-slate-600">Mọi chênh lệch khác 0 phải có phiên bản quy tắc, lời giải thích và URL bị ảnh hưởng nếu chênh lệch liên quan đến URL cụ thể. Phê duyệt của PM hoặc Finance sẽ bị từ chối khi còn bất kỳ dòng nào chưa được giải thích.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{["discipline","seo_content","seo_performance","social_video"].map((componentKey) => <div className="rounded-xl border p-3" key={componentKey}><strong>{uiLabel(componentKey)}</strong><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Sheet %<input className="mt-1 w-full rounded border p-2" value={shadowSheetValues[componentKey] ?? ""} onChange={(event) => setShadowSheetValues((current) => ({...current,[componentKey]:event.target.value}))}/></label><label className="text-xs">V2 %<input readOnly className="mt-1 w-full rounded border bg-slate-50 p-2" value={components[componentKey]?.payable_pct ?? "N/A"}/></label></div><label className="mt-2 block text-xs">URL nguồn bị ảnh hưởng (nếu có)<input className="mt-1 w-full rounded border p-2" value={shadowSourceUrls[componentKey] ?? ""} onChange={(event) => setShadowSourceUrls((current) => ({...current,[componentKey]:event.target.value}))}/></label><label className="mt-2 block text-xs">Giải thích theo URL/quy tắc<input className="mt-1 w-full rounded border p-2" value={shadowExplanations[componentKey] ?? ""} onChange={(event) => setShadowExplanations((current) => ({...current,[componentKey]:event.target.value}))}/></label><div className="mt-2 text-xs text-slate-500">Quy tắc: {components[componentKey]?.rule_version ?? "manual_component_v2"}</div></div>)}</div>
        {(initialAudit.differences ?? []).length > 0 && <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-2">Thành phần</th><th>Sheet / V2 / chênh lệch</th><th>URL</th><th>Quy tắc</th><th>Giải thích</th><th>Trạng thái</th></tr></thead><tbody>{initialAudit.differences.map((row: any) => <tr className="border-t" key={row.id}><td className="p-2">{uiLabel(row.component_key)}</td><td>{row.sheet_value ?? "N/A"} / {row.v2_value ?? "N/A"} / {row.delta ?? "N/A"}</td><td className="max-w-xs break-all">{row.source_url ?? "cấp thành phần"}</td><td>{row.rule_version ?? "N/A"}</td><td>{row.explanation ?? "Thiếu"}</td><td className={row.is_explained ? "text-emerald-700" : "font-semibold text-red-700"}>{row.is_explained ? "Đã giải thích" : "Chưa giải thích"}</td></tr>)}</tbody></table></div>}
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={pending || !featureEnabled} onClick={() => run(saveShadow)} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Lưu bằng chứng chênh lệch</button><button disabled={pending || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/approvals`, { memberName, role: "pm", status: "approved", note: "PM đã đánh giá bằng chứng shadow" }))} className="rounded-lg border px-4 py-2 font-semibold">PM phê duyệt</button><button disabled={pending || !featureEnabled} onClick={() => run(() => post(`/api/admin/kpi-month/${month}/approvals`, { memberName, role: "finance", status: "approved", note: "Finance đã đánh giá bằng chứng chi trả" }))} className="rounded-lg border px-4 py-2 font-semibold">Finance phê duyệt</button><a className="rounded-lg border px-4 py-2 font-semibold text-blue-700" href={`/api/admin/kpi-month/${month}/audit?member=${encodeURIComponent(memberName)}`}>Xuất JSON audit</a></div><div className="mt-3 flex flex-wrap gap-2 text-xs">{(initialAudit.approvals ?? []).map((approval: any) => <span className="rounded-full bg-slate-100 px-3 py-1" key={approval.id}>{approval.approval_role}: {uiLabel(approval.status)} · {approval.approver ?? "chưa phân công"}</span>)}</div></section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Dòng thời gian audit</h3><div className="mt-3 space-y-2 text-sm">{(initialAudit.runs ?? []).map((run: any) => <div className="rounded-lg bg-slate-50 p-3" key={run.id}><strong>{uiLabel(run.step)}</strong> · {uiLabel(run.status)} · {new Date(run.started_at).toLocaleString("vi-VN")}<span className="ml-2 font-mono text-xs">{run.request_id}</span>{run.error_message && <div className="text-red-700">{run.error_code}: {run.error_message}</div>}</div>)}{!(initialAudit.runs ?? []).length && <p className="text-slate-500">Chưa ghi nhận lần chạy quy trình nào cho thành viên/tháng này.</p>}</div></section>
    </> : <section className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600">Chọn một thành viên để bắt đầu quy trình shadow theo tháng.</section>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 break-words text-lg font-bold">{value}</div></div>; }
function Action({ title, help, disabled, onClick }: { title: string; help: string; disabled?: boolean; onClick: () => void }) { return <button disabled={disabled} onClick={onClick} className="rounded-xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40"><strong>{title}</strong><span className="mt-1 block text-xs font-normal text-slate-600">{help}</span></button>; }
