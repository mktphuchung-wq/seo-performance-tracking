import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getDbPerformance } from "../../../lib/postgres";
import { adjustedProjectFromRows, cohortModes, getProjectKpiSettings, getProjectKpiSettingsDiagnosticMessage, isProjectKpiSettingsColumnMissingError, isProjectKpiSettingsMissingError, noDataPolicies, projectKpiTypes } from "../../../lib/project-kpi";
import { fmtKpi, Shell } from "../../../components/ui";
import { getProjectKpiSettingsDiagnostic, type ProjectKpiSettingsDiagnostic } from "../../../lib/db-health";

type PageProps = { searchParams?: { project?: string } };

const help = {
  type: "New Project gets stronger KPI protection. Growth Project gets moderate protection. Stable Project is evaluated closer to raw SEO performance.",
  floor: "Minimum Adjusted Performance Final % when protection rules apply. Helps avoid unfair KPI drops caused by new project/data limitations.",
  review: "If performance is below this value, PM should review manually instead of relying only on automatic scoring.",
  urlAge: "Short-term performance should only evaluate URLs old enough to have SEO data. New URLs are excluded from 1M/3M/6M until they reach the required age. All-time always includes all active URLs.",
  weighting: "Weights control how much each range contributes to the final score. If a range has not enough data and normalization is enabled, the app excludes that range and redistributes weight across available ranges.",
  override: "Use PM Override only when automatic rules do not reflect the real situation. A reason is required for transparency.",
  noData: "Not enough data is not poor performance by default. Choose whether to exclude, score neutral, mildly penalize, or require PM review.",
};

function label(value: string | null | undefined, fallback = "growth_project") {
  return String(value || fallback).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
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
    <div className="mb-6"><h2 className="text-2xl font-semibold">Project KPI Settings</h2><p className="text-sm text-slate-500">PM-friendly settings for KPI protection, URL age eligibility, weighting, and manual overrides.</p></div>
    {setupWarning && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">{setupWarning}</p>{setupDiagnostic && <p className="mt-2">Missing columns: {setupDiagnostic.missing_project_kpi_columns.length ? setupDiagnostic.missing_project_kpi_columns.join(", ") : "none"}</p>}</div>}

    <form action="/admin/project-kpi-settings" className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-800">1. Select Project</h3>
      <div className="flex flex-col gap-3 md:flex-row">
        <select id="project" name="project" className="w-full rounded-lg border px-3 py-2 md:max-w-xl" defaultValue={selectedSetting?.project || ""}>
          <option value="">Choose a project...</option>{settings.map((s) => <option key={s.project} value={s.project}>{s.project}</option>)}
        </select>
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Load settings</button>
      </div>
      {selectedProject && !selectedSetting && <p className="mt-3 text-sm font-medium text-amber-700">Choose a valid active project to edit KPI settings.</p>}
    </form>

    {!selectedSetting && <div className="mb-6 rounded-2xl border border-dashed bg-white p-6 text-sm text-slate-600">Choose a project to edit KPI settings.</div>}

    {selectedSetting && <form action="/api/project-kpi-settings" method="post" className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
      <input type="hidden" name="project" value={selectedSetting.project} />
      <div className="mb-5 flex flex-col justify-between gap-2 md:flex-row md:items-center"><div><h3 className="text-lg font-semibold">Settings for {selectedSetting.project}</h3><p className="text-sm text-slate-500">One selected project shows one settings form.</p></div><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Save settings</button></div>
      <div className="grid gap-6">
        <section><h4 className="mb-3 font-semibold text-slate-800">2. Project Setup</h4><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Project Name<input className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2" value={selectedSetting.project} readOnly /></label><label className="text-sm text-slate-600">Project KPI Type<HelpIcon text={help.type} /><select className="mt-1 w-full rounded-lg border px-3 py-2" name="project_kpi_type" defaultValue={selectedSetting.project_kpi_type}>{projectKpiTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>{field("project_start_date", "Project Start Date", selectedSetting.project_start_date, "date")}{check("is_kpi_protection_enabled", "Enable KPI Protection", selectedSetting.is_kpi_protection_enabled)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">3. KPI Protection</h4><div className="grid gap-4 md:grid-cols-2">{field("performance_floor_pct", "Performance Floor %", selectedSetting.performance_floor_pct, "number", help.floor)}{field("require_pm_review_below_pct", "Require PM Review Below %", selectedSetting.require_pm_review_below_pct, "number", help.review)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">4. URL Age Eligibility <HelpIcon text={help.urlAge} /></h4><div className="rounded-xl border bg-slate-50 p-4">{check("enable_cohort_based_measurement", "Enable URL Age Rule", selectedSetting.enable_cohort_based_measurement, help.urlAge)}<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700"><li>1M Performance: URLs older than 1 month</li><li>3M Performance: URLs older than 3 months</li><li>6M Performance: URLs older than 6 months</li><li>All-time Performance: All active URLs</li></ul><p className="mt-3 text-xs text-slate-500">{help.urlAge}</p></div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">5. Performance Weighting <HelpIcon text={help.weighting} /></h4><div className="grid gap-4 md:grid-cols-4">{field("performance_weight_1m_pct", "1M Weight %", selectedSetting.performance_weight_1m_pct, "number")}{field("performance_weight_3m_pct", "3M Weight %", selectedSetting.performance_weight_3m_pct, "number")}{field("performance_weight_6m_pct", "6M Weight %", selectedSetting.performance_weight_6m_pct, "number")}{field("performance_weight_all_time_pct", "All Time Weight %", selectedSetting.performance_weight_all_time_pct, "number")}</div><div className="mt-3">{check("normalize_missing_ranges", "Normalize Missing Ranges", selectedSetting.normalize_missing_ranges, help.weighting)}</div><p className="mt-2 text-xs text-slate-500">{help.weighting}</p>{totalWeight !== 100 && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Warning: current saved weights total {totalWeight}%. Total weights should equal 100%.</p>}</section>
        <section><h4 className="mb-3 font-semibold text-slate-800">6. PM Override <HelpIcon text={help.override} /></h4><div className="grid gap-4 md:grid-cols-3">{check("pm_override_enabled", "Enable PM Override", selectedSetting.pm_override_enabled, help.override)}{field("pm_override_adjusted_pct", "PM Override Adjusted %", selectedSetting.pm_override_adjusted_pct, "number")}<label className="text-sm text-slate-600 md:col-span-3">PM Override Reason<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="pm_override_reason" required={selectedSetting.pm_override_enabled} defaultValue={selectedSetting.pm_override_reason || ""} /></label></div><p className="mt-2 text-xs text-slate-500">{help.override}</p></section>
        <details className="rounded-2xl border bg-slate-50 p-4"><summary className="cursor-pointer font-semibold text-slate-800">7. Advanced Settings</summary><div className="mt-4 grid gap-6"><section><h5 className="mb-3 font-semibold">Coverage and auto-floor rules</h5><div className="grid gap-4 md:grid-cols-3">{field("min_coverage_required", "Min Coverage Required", selectedSetting.min_coverage_required, "number")}{field("min_eligible_urls", "Min Eligible URLs", selectedSetting.min_eligible_urls, "number")}{field("max_excluded_no_data_rate", "Max Excluded No Data Rate", selectedSetting.max_excluded_no_data_rate, "number")}{check("allow_auto_floor_when_low_confidence", "Allow auto-floor when low confidence", selectedSetting.allow_auto_floor_when_low_confidence)}{check("allow_auto_floor_when_partial_coverage", "Allow auto-floor when partial coverage", selectedSetting.allow_auto_floor_when_partial_coverage)}{check("allow_auto_floor_when_high_no_data", "Allow auto-floor when high no-data", selectedSetting.allow_auto_floor_when_high_no_data)}</div></section><section><h5 className="mb-3 font-semibold">Not Enough Data Policy <HelpIcon text={help.noData} /></h5><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Not Enough Data Policy<HelpIcon text={help.noData} /><select className="mt-1 w-full rounded-lg border px-3 py-2" name="not_enough_data_policy" defaultValue={selectedSetting.not_enough_data_policy}>{noDataPolicies.map((policy) => <option key={policy} value={policy}>{label(policy, "neutral_score")}</option>)}</select></label>{field("neutral_no_data_score_pct", "Neutral No-data Score %", selectedSetting.neutral_no_data_score_pct, "number")}{field("min_url_age_days_for_penalty", "Min URL Age Days For Penalty", selectedSetting.min_url_age_days_for_penalty, "number")}{field("max_no_data_penalty_pct", "Max No-data Penalty %", selectedSetting.max_no_data_penalty_pct, "number")}{field("no_data_rate_pm_review_pct", "No-data Rate Requiring PM Review %", selectedSetting.no_data_rate_pm_review_pct, "number")}</div></section><section><h5 className="mb-3 font-semibold">Technical URL age settings</h5><div className="grid gap-4 md:grid-cols-3">{field("seo_lag_days", "SEO Lag Days", selectedSetting.seo_lag_days, "number")}{field("url_work_date_field", "URL Work Date Field", selectedSetting.url_work_date_field)}{["cohort_mode_1m", "cohort_mode_3m", "cohort_mode_6m", "cohort_mode_all_time"].map((name) => <label key={name} className="text-sm text-slate-600">{label(name)}<select className="mt-1 w-full rounded-lg border px-3 py-2" name={name} defaultValue={String(selectedSetting[name as keyof typeof selectedSetting])}>{cohortModes.map((mode) => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>)}</div></section><section><h5 className="mb-3 font-semibold">Other advanced protection</h5><div className="grid gap-4 md:grid-cols-4">{field("performance_cap_pct", "Performance Cap %", selectedSetting.performance_cap_pct, "number")}{check("enable_long_term_trend_protection", "Enable Long-term Trend Protection", selectedSetting.enable_long_term_trend_protection)}{field("trend_protection_floor_pct", "Trend Protection Floor %", selectedSetting.trend_protection_floor_pct, "number")}{field("trend_protection_required_3m_pct", "Required 3M KPI %", selectedSetting.trend_protection_required_3m_pct, "number")}{field("trend_protection_required_all_time_pct", "Required All Time KPI %", selectedSetting.trend_protection_required_all_time_pct, "number")}</div></section><section><h5 className="mb-3 font-semibold">Notes</h5><textarea className="w-full rounded-lg border px-3 py-2" name="notes" defaultValue={selectedSetting.notes || ""} /></section></div></details>
      </div>
    </form>}

    <div className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Project</th><th>Project Type</th><th>Protection Enabled</th><th>Floor %</th><th>PM Override</th><th>Updated At</th><th>Edit</th></tr></thead><tbody>{settings.map((s) => { const a = adjusted.get(s.project); return <tr className="border-t" key={s.project}><td className="p-3 font-medium">{s.project}<div className="text-xs font-normal text-slate-500">Adjusted: {fmtKpi(a?.adjusted_performance_final_pct)}</div></td><td>{label(s.project_kpi_type)}</td><td>{s.is_kpi_protection_enabled ? "Yes" : "No"}</td><td>{fmtKpi(s.performance_floor_pct)}</td><td>{s.pm_override_enabled ? "Enabled" : "Disabled"}</td><td>{s.updated_at ? new Date(s.updated_at).toLocaleString() : "—"}</td><td><a className="text-blue-700" href={`/admin/project-kpi-settings?project=${encodeURIComponent(s.project)}`}>Edit</a></td></tr>; })}</tbody></table></div>
  </Shell>;
}
