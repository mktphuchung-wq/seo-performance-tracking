import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getDbPerformance } from "../../../lib/postgres";
import { adjustedProjectFromRows, cohortModes, getProjectKpiSettings, getProjectKpiSettingsDiagnosticMessage, isProjectKpiSettingsColumnMissingError, isProjectKpiSettingsMissingError, noDataPolicies, projectKpiTypes } from "../../../lib/project-kpi";
import { fmtKpi, Shell } from "../../../components/ui";
import { getProjectKpiSettingsDiagnostic, type ProjectKpiSettingsDiagnostic } from "../../../lib/db-health";
import { uiLabel, yesNo } from "../../../lib/ui-labels";

type PageProps = { searchParams?: { project?: string } };

const help = {
  type: "Dự án mới được bảo vệ KPI mạnh hơn. Dự án tăng trưởng được bảo vệ ở mức vừa. Dự án ổn định được đánh giá gần với hiệu suất SEO ban đầu hơn.",
  floor: "Performance cuối cùng sau điều chỉnh tối thiểu khi áp dụng quy tắc bảo vệ. Giúp tránh giảm KPI thiếu công bằng do giới hạn dữ liệu hoặc dự án mới.",
  review: "Nếu Performance thấp hơn giá trị này, PM cần đánh giá thủ công thay vì chỉ dựa vào chấm điểm tự động.",
  urlAge: "Performance ngắn hạn chỉ nên đánh giá URL đủ tuổi để có dữ liệu SEO. URL mới bị loại khỏi 1M/3M/6M cho đến khi đạt tuổi yêu cầu. Toàn thời gian luôn bao gồm mọi URL đang hoạt động.",
  weighting: "Trọng số kiểm soát mức đóng góp của từng khoảng vào điểm cuối. Nếu một khoảng chưa đủ dữ liệu và bật chuẩn hóa, ứng dụng loại khoảng đó và phân bổ lại trọng số cho các khoảng khả dụng.",
  override: "Chỉ dùng PM Override khi quy tắc tự động không phản ánh đúng thực tế. Bắt buộc nhập lý do để đảm bảo minh bạch.",
  noData: "Chưa đủ dữ liệu mặc định không có nghĩa là hiệu suất kém. Chọn loại trừ, chấm điểm trung tính, phạt nhẹ hoặc yêu cầu PM đánh giá.",
};

function label(value: string | null | undefined, fallback = "growth_project") { return uiLabel(value || fallback); }
function HelpIcon({ text }: { text: string }) {
  return <span title={text} className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">?</span>;
}
function field(name: string, labelText: string, value: string | number | null | undefined, type = "text", helpText?: string) {
  return <label className="text-sm text-slate-600">{labelText}{helpText && <HelpIcon text={helpText} />}<input className="mt-1 w-full rounded-lg border px-3 py-2" name={name} type={type} defaultValue={value ?? ""} /></label>;
}
function check(name: string, labelText: string, checked: boolean, helpText?: string) {
  return <label className="flex items-center gap-2 text-sm text-slate-700"><input name={name} type="checkbox" defaultChecked={checked} />{labelText}{helpText && <HelpIcon text={helpText} />}</label>;
}

export default async function ProjectKpiSettingsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");

  let setupWarning: string | null = null;
  let setupDiagnostic: ProjectKpiSettingsDiagnostic | null = null;
  let settings = [] as Awaited<ReturnType<typeof getProjectKpiSettings>>;
  let rows = [] as Awaited<ReturnType<typeof getDbPerformance>>;
  try {
    [settings, rows] = await Promise.all([getProjectKpiSettings(), getDbPerformance("current_month", getDateRange({ range: "current_month" }))]);
  } catch (error) {
    if (!isProjectKpiSettingsMissingError(error) && !isProjectKpiSettingsColumnMissingError(error)) throw error;
    setupDiagnostic = await getProjectKpiSettingsDiagnostic(error);
    setupWarning = await getProjectKpiSettingsDiagnosticMessage(error);
  }

  const selectedProject = (searchParams?.project || "").trim();
  const selectedSetting = selectedProject ? settings.find((s) => s.project === selectedProject) : undefined;
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => { (acc[row.project] ??= []).push(row); return acc; }, {});
  const adjusted = new Map(Object.entries(grouped).map(([project, list]) => [project, adjustedProjectFromRows(project, list, settings.find((s) => s.project === project))]));
  const totalWeight = selectedSetting ? selectedSetting.performance_weight_1m_pct + selectedSetting.performance_weight_3m_pct + selectedSetting.performance_weight_6m_pct + selectedSetting.performance_weight_all_time_pct : 100;

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6"><h2 className="text-2xl font-semibold">Cài đặt KPI dự án</h2><p className="text-sm text-slate-500">Cài đặt thân thiện với PM cho bảo vệ KPI, điều kiện tuổi URL, trọng số và điều chỉnh thủ công.</p></div>
    {setupWarning && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">{setupWarning}</p>{setupDiagnostic && <p className="mt-2">Cột bị thiếu: {setupDiagnostic.missing_project_kpi_columns.length ? setupDiagnostic.missing_project_kpi_columns.join(", ") : "không có"}</p>}</div>}

    <form action="/admin/project-kpi-settings" className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-800">1. Chọn dự án</h3>
      <div className="flex flex-col gap-3 md:flex-row">
        <select id="project" name="project" className="w-full rounded-lg border px-3 py-2 md:max-w-xl" defaultValue={selectedSetting?.project || ""}>
          <option value="">Chọn một dự án...</option>{settings.map((s) => <option key={s.project} value={s.project}>{s.project}</option>)}
        </select>
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Tải cài đặt</button>
      </div>
      {selectedProject && !selectedSetting && <p className="mt-3 text-sm font-medium text-amber-700">Chọn một dự án đang hoạt động hợp lệ để chỉnh sửa cài đặt KPI.</p>}
    </form>

    {!selectedSetting && <div className="mb-6 rounded-2xl border border-dashed bg-white p-6 text-sm text-slate-600">Chọn một dự án để chỉnh sửa cài đặt KPI.</div>}

    {selectedSetting && <form action="/api/project-kpi-settings" method="post" className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
      <input type="hidden" name="project" value={selectedSetting.project} />
      <div className="mb-5 flex flex-col justify-between gap-2 md:flex-row md:items-center"><div><h3 className="text-lg font-semibold">Cài đặt cho {selectedSetting.project}</h3><p className="text-sm text-slate-500">Mỗi dự án được chọn hiển thị một biểu mẫu cài đặt.</p></div><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Lưu cài đặt</button></div>
      <div className="grid gap-6">
        <section><h4 className="mb-3 font-semibold text-slate-800">2. Thiết lập dự án</h4><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Tên dự án<input className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2" value={selectedSetting.project} readOnly /></label><label className="text-sm text-slate-600">Loại KPI dự án<HelpIcon text={help.type} /><select className="mt-1 w-full rounded-lg border px-3 py-2" name="project_kpi_type" defaultValue={selectedSetting.project_kpi_type}>{projectKpiTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>{field("project_start_date", "Ngày bắt đầu dự án", selectedSetting.project_start_date, "date")}{check("is_kpi_protection_enabled", "Bật bảo vệ KPI", selectedSetting.is_kpi_protection_enabled)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">3. Bảo vệ KPI</h4><div className="grid gap-4 md:grid-cols-2">{field("performance_floor_pct", "Sàn Performance %", selectedSetting.performance_floor_pct, "number", help.floor)}{field("require_pm_review_below_pct", "Yêu cầu PM đánh giá khi dưới %", selectedSetting.require_pm_review_below_pct, "number", help.review)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">4. Điều kiện tuổi URL <HelpIcon text={help.urlAge} /></h4><div className="rounded-xl border bg-slate-50 p-4">{check("enable_cohort_based_measurement", "Bật quy tắc tuổi URL", selectedSetting.enable_cohort_based_measurement, help.urlAge)}<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700"><li>Performance 1M: URL cũ hơn 1 tháng</li><li>Performance 3M: URL cũ hơn 3 tháng</li><li>Performance 6M: URL cũ hơn 6 tháng</li><li>Performance toàn thời gian: mọi URL đang hoạt động</li></ul><p className="mt-3 text-xs text-slate-500">{help.urlAge}</p></div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">5. Trọng số Performance <HelpIcon text={help.weighting} /></h4><div className="grid gap-4 md:grid-cols-4">{field("performance_weight_1m_pct", "Trọng số 1M %", selectedSetting.performance_weight_1m_pct, "number")}{field("performance_weight_3m_pct", "Trọng số 3M %", selectedSetting.performance_weight_3m_pct, "number")}{field("performance_weight_6m_pct", "Trọng số 6M %", selectedSetting.performance_weight_6m_pct, "number")}{field("performance_weight_all_time_pct", "Trọng số toàn thời gian %", selectedSetting.performance_weight_all_time_pct, "number")}</div><div className="mt-3">{check("normalize_missing_ranges", "Chuẩn hóa các khoảng bị thiếu", selectedSetting.normalize_missing_ranges, help.weighting)}</div><p className="mt-2 text-xs text-slate-500">{help.weighting}</p>{totalWeight !== 100 && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Cảnh báo: tổng trọng số đang lưu là {totalWeight}%. Tổng trọng số phải bằng 100%.</p>}</section>
        <section><h4 className="mb-3 font-semibold text-slate-800">6. PM điều chỉnh <HelpIcon text={help.override} /></h4><div className="grid gap-4 md:grid-cols-3">{check("pm_override_enabled", "Bật PM điều chỉnh", selectedSetting.pm_override_enabled, help.override)}{field("pm_override_adjusted_pct", "Mức PM điều chỉnh %", selectedSetting.pm_override_adjusted_pct, "number")}<label className="text-sm text-slate-600 md:col-span-3">Lý do PM điều chỉnh<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="pm_override_reason" required={selectedSetting.pm_override_enabled} defaultValue={selectedSetting.pm_override_reason || ""} /></label></div><p className="mt-2 text-xs text-slate-500">{help.override}</p></section>
        <details className="rounded-2xl border bg-slate-50 p-4"><summary className="cursor-pointer font-semibold text-slate-800">7. Cài đặt nâng cao</summary><div className="mt-4 grid gap-6"><section><h5 className="mb-3 font-semibold">Quy tắc độ phủ và sàn tự động</h5><div className="grid gap-4 md:grid-cols-3">{field("min_coverage_required", "Độ phủ tối thiểu bắt buộc", selectedSetting.min_coverage_required, "number")}{field("min_eligible_urls", "Số URL đủ điều kiện tối thiểu", selectedSetting.min_eligible_urls, "number")}{field("max_excluded_no_data_rate", "Tỷ lệ thiếu dữ liệu bị loại tối đa", selectedSetting.max_excluded_no_data_rate, "number")}{check("allow_auto_floor_when_low_confidence", "Cho phép sàn tự động khi độ tin cậy thấp", selectedSetting.allow_auto_floor_when_low_confidence)}{check("allow_auto_floor_when_partial_coverage", "Cho phép sàn tự động khi độ phủ một phần", selectedSetting.allow_auto_floor_when_partial_coverage)}{check("allow_auto_floor_when_high_no_data", "Cho phép sàn tự động khi tỷ lệ thiếu dữ liệu cao", selectedSetting.allow_auto_floor_when_high_no_data)}</div></section><section><h5 className="mb-3 font-semibold">Chính sách chưa đủ dữ liệu <HelpIcon text={help.noData} /></h5><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Chính sách chưa đủ dữ liệu<HelpIcon text={help.noData} /><select className="mt-1 w-full rounded-lg border px-3 py-2" name="not_enough_data_policy" defaultValue={selectedSetting.not_enough_data_policy}>{noDataPolicies.map((policy) => <option key={policy} value={policy}>{label(policy, "neutral_score")}</option>)}</select></label>{field("neutral_no_data_score_pct", "Điểm trung tính khi thiếu dữ liệu %", selectedSetting.neutral_no_data_score_pct, "number")}{field("min_url_age_days_for_penalty", "Tuổi URL tối thiểu để áp dụng phạt (ngày)", selectedSetting.min_url_age_days_for_penalty, "number")}{field("max_no_data_penalty_pct", "Mức phạt thiếu dữ liệu tối đa %", selectedSetting.max_no_data_penalty_pct, "number")}{field("no_data_rate_pm_review_pct", "Tỷ lệ thiếu dữ liệu cần PM đánh giá %", selectedSetting.no_data_rate_pm_review_pct, "number")}</div></section><section><h5 className="mb-3 font-semibold">Cài đặt kỹ thuật về tuổi URL</h5><div className="grid gap-4 md:grid-cols-3">{field("seo_lag_days", "Độ trễ SEO (ngày)", selectedSetting.seo_lag_days, "number")}{field("url_work_date_field", "Trường ngày thực hiện URL", selectedSetting.url_work_date_field)}{["cohort_mode_1m", "cohort_mode_3m", "cohort_mode_6m", "cohort_mode_all_time"].map((name) => <label key={name} className="text-sm text-slate-600">{label(name)}<select className="mt-1 w-full rounded-lg border px-3 py-2" name={name} defaultValue={String(selectedSetting[name as keyof typeof selectedSetting])}>{cohortModes.map((mode) => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>)}</div></section><section><h5 className="mb-3 font-semibold">Bảo vệ nâng cao khác</h5><div className="grid gap-4 md:grid-cols-4">{field("performance_cap_pct", "Trần Performance %", selectedSetting.performance_cap_pct, "number")}{check("enable_long_term_trend_protection", "Bật bảo vệ xu hướng dài hạn", selectedSetting.enable_long_term_trend_protection)}{field("trend_protection_floor_pct", "Sàn bảo vệ xu hướng %", selectedSetting.trend_protection_floor_pct, "number")}{field("trend_protection_required_3m_pct", "KPI 3M bắt buộc %", selectedSetting.trend_protection_required_3m_pct, "number")}{field("trend_protection_required_all_time_pct", "KPI toàn thời gian bắt buộc %", selectedSetting.trend_protection_required_all_time_pct, "number")}</div></section><section><h5 className="mb-3 font-semibold">Ghi chú</h5><textarea className="w-full rounded-lg border px-3 py-2" name="notes" defaultValue={selectedSetting.notes || ""} /></section></div></details>
      </div>
    </form>}

    <div className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Dự án</th><th>Loại dự án</th><th>Đã bật bảo vệ</th><th>Sàn %</th><th>PM điều chỉnh</th><th>Cập nhật lúc</th><th>Chỉnh sửa</th></tr></thead><tbody>{settings.map((s) => { const a = adjusted.get(s.project); return <tr className="border-t" key={s.project}><td className="p-3 font-medium">{s.project}<div className="text-xs font-normal text-slate-500">Sau điều chỉnh: {fmtKpi(a?.adjusted_performance_final_pct)}</div></td><td>{label(s.project_kpi_type)}</td><td>{yesNo(s.is_kpi_protection_enabled)}</td><td>{fmtKpi(s.performance_floor_pct)}</td><td>{s.pm_override_enabled ? "Đã bật" : "Đã tắt"}</td><td>{s.updated_at ? new Date(s.updated_at).toLocaleString("vi-VN") : "—"}</td><td><a className="text-blue-700" href={`/admin/project-kpi-settings?project=${encodeURIComponent(s.project)}`}>Chỉnh sửa</a></td></tr>; })}</tbody></table></div>
  </Shell>;
}
