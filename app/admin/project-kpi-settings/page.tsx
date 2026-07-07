import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getDbPerformance } from "../../../lib/postgres";
import { adjustedProjectFromRows, getProjectKpiSettings, isProjectKpiSettingsMissingError, PROJECT_KPI_SETTINGS_MISSING_MESSAGE, projectKpiTypes } from "../../../lib/project-kpi";
import { fmtKpi, Shell } from "../../../components/ui";

function field(name: string, label: string, value: string | number | null | undefined, type = "text") {
  return <label className="text-sm text-slate-600">{label}<input className="mt-1 w-full rounded-lg border px-3 py-2" name={name} type={type} defaultValue={value ?? ""} /></label>;
}
function check(name: string, label: string, checked: boolean) {
  return <label className="flex items-center gap-2 text-sm text-slate-700"><input name={name} type="checkbox" defaultChecked={checked} />{label}</label>;
}

export default async function ProjectKpiSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  let setupWarning: string | null = null;
  let settings = [] as Awaited<ReturnType<typeof getProjectKpiSettings>>;
  let rows = [] as Awaited<ReturnType<typeof getDbPerformance>>;
  try {
    [settings, rows] = await Promise.all([getProjectKpiSettings(), getDbPerformance("current_month", getDateRange({ range: "current_month" }))]);
  } catch (error) {
    if (!isProjectKpiSettingsMissingError(error)) throw error;
    setupWarning = PROJECT_KPI_SETTINGS_MISSING_MESSAGE;
  }
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => { (acc[row.project] ??= []).push(row); return acc; }, {});
  const adjusted = new Map(Object.entries(grouped).map(([project, list]) => [project, adjustedProjectFromRows(project, list, settings.find((s) => s.project === project))]));

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6"><h2 className="text-2xl font-semibold">Project KPI Settings</h2><p className="text-sm text-slate-500">Classify projects and configure KPI protection, PM review thresholds, floors/caps, and auditable overrides.</p></div>
    {setupWarning && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">{setupWarning}</div>}
    <div className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Project</th><th>Project Type</th><th>Start Date</th><th>Active URLs</th><th>Raw Performance Final %</th><th>Adjusted Performance Final %</th><th>Protection Enabled</th><th>PM Review Required</th><th>Actions</th></tr></thead><tbody>{settings.map((s) => { const a = adjusted.get(s.project); return <tr className="border-t" key={s.project}><td className="p-3 font-medium">{s.project}</td><td>{s.project_kpi_type.replace(/_/g, " ")}</td><td>{s.project_start_date || "—"}</td><td>{s.active_urls ?? a?.active_urls ?? 0}</td><td>{fmtKpi(a?.raw_performance_final_pct)}</td><td><strong>{fmtKpi(a?.adjusted_performance_final_pct)}</strong>{a?.kpi_protection_applied && <div className="text-xs text-blue-700">Adjusted upward due to project KPI protection rules.</div>}{s.pm_override_enabled && <div className="text-xs text-purple-700">PM override visible: {s.pm_override_reason || "No reason provided"}</div>}</td><td>{s.is_kpi_protection_enabled ? "Yes" : "No"}</td><td>{a?.pm_review_required ? "Yes" : "No"}</td><td><a className="text-blue-700" href={`#edit-${encodeURIComponent(s.project)}`}>Edit</a></td></tr>; })}</tbody></table></div>
    <div className="mt-8 grid gap-6">{settings.map((s) => <form id={`edit-${encodeURIComponent(s.project)}`} key={s.project} action="/api/project-kpi-settings" method="post" className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-semibold">Edit {s.project}</h3><input type="hidden" name="project" value={s.project} /><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Project KPI Type<select className="mt-1 w-full rounded-lg border px-3 py-2" name="project_kpi_type" defaultValue={s.project_kpi_type}>{projectKpiTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label>{field("project_start_date", "Project Start Date", s.project_start_date, "date")}{field("performance_floor_pct", "Performance Floor %", s.performance_floor_pct, "number")}{field("performance_cap_pct", "Performance Cap %", s.performance_cap_pct, "number")}{field("min_coverage_required", "Min Coverage Required", s.min_coverage_required, "number")}{field("min_eligible_urls", "Min Eligible URLs", s.min_eligible_urls, "number")}{field("max_excluded_no_data_rate", "Max Excluded No Data Rate", s.max_excluded_no_data_rate, "number")}{field("require_pm_review_below_pct", "Require PM Review Below %", s.require_pm_review_below_pct, "number")}{field("pm_override_adjusted_pct", "PM Override Adjusted %", s.pm_override_adjusted_pct, "number")}<label className="text-sm text-slate-600 md:col-span-2">PM Override Reason<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="pm_override_reason" defaultValue={s.pm_override_reason || ""} /></label><label className="text-sm text-slate-600 md:col-span-3">Notes<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="notes" defaultValue={s.notes || ""} /></label></div><div className="mt-4 grid gap-2 md:grid-cols-2">{check("is_kpi_protection_enabled", "Enable KPI Protection", s.is_kpi_protection_enabled)}{check("allow_auto_floor_when_low_confidence", "Allow auto-floor when low confidence", s.allow_auto_floor_when_low_confidence)}{check("allow_auto_floor_when_partial_coverage", "Allow auto-floor when partial coverage", s.allow_auto_floor_when_partial_coverage)}{check("allow_auto_floor_when_high_no_data", "Allow auto-floor when high no-data", s.allow_auto_floor_when_high_no_data)}{check("pm_override_enabled", "Enable PM Override", s.pm_override_enabled)}</div><button className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Save settings</button></form>)}</div>
  </Shell>;
}
