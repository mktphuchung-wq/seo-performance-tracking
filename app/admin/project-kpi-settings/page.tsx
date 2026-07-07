import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getDateRange } from "../../../lib/dates";
import { getDbPerformance } from "../../../lib/postgres";
import { adjustedProjectFromRows, getProjectKpiSettings, isProjectKpiSettingsMissingError, PROJECT_KPI_SETTINGS_MISSING_MESSAGE, projectKpiTypes } from "../../../lib/project-kpi";
import { fmtKpi, Shell } from "../../../components/ui";

type PageProps = {
  searchParams?: { project?: string };
};

function field(name: string, label: string, value: string | number | null | undefined, type = "text") {
  return <label className="text-sm text-slate-600">{label}<input className="mt-1 w-full rounded-lg border px-3 py-2" name={name} type={type} defaultValue={value ?? ""} /></label>;
}
function check(name: string, label: string, checked: boolean) {
  return <label className="flex items-center gap-2 text-sm text-slate-700"><input name={name} type="checkbox" defaultChecked={checked} />{label}</label>;
}

export default async function ProjectKpiSettingsPage({ searchParams }: PageProps) {
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
  const selectedProject = (searchParams?.project || "").trim();
  const selectedSetting = selectedProject ? settings.find((s) => s.project === selectedProject) : undefined;
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => { (acc[row.project] ??= []).push(row); return acc; }, {});
  const adjusted = new Map(Object.entries(grouped).map(([project, list]) => [project, adjustedProjectFromRows(project, list, settings.find((s) => s.project === project))]));

  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-6"><h2 className="text-2xl font-semibold">Project KPI Settings</h2><p className="text-sm text-slate-500">Select one active project, then configure one KPI settings form for that project.</p></div>
    {setupWarning && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">{setupWarning}</div>}

    <form action="/admin/project-kpi-settings" className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold text-slate-700" htmlFor="project">Select Project</label>
      <div className="mt-2 flex flex-col gap-3 md:flex-row">
        <select id="project" name="project" className="w-full rounded-lg border px-3 py-2 md:max-w-xl" defaultValue={selectedSetting?.project || ""}>
          <option value="">Choose a project...</option>
          {settings.map((s) => <option key={s.project} value={s.project}>{s.project}</option>)}
        </select>
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Load settings</button>
      </div>
      {selectedProject && !selectedSetting && <p className="mt-3 text-sm font-medium text-amber-700">Choose a valid active project to edit KPI settings.</p>}
    </form>

    {!selectedSetting && <div className="mb-6 rounded-2xl border border-dashed bg-white p-6 text-sm text-slate-600">Choose a project to edit KPI settings.</div>}

    {selectedSetting && <form action="/api/project-kpi-settings" method="post" className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
      <input type="hidden" name="project" value={selectedSetting.project} />
      <div className="mb-5 flex flex-col justify-between gap-2 md:flex-row md:items-center"><div><h3 className="text-lg font-semibold">Settings for {selectedSetting.project}</h3><p className="text-sm text-slate-500">One project selected → one settings form → one save action.</p></div><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" type="submit">Save settings</button></div>
      <div className="grid gap-6">
        <section><h4 className="mb-3 font-semibold text-slate-800">Project Setup</h4><div className="grid gap-4 md:grid-cols-3"><label className="text-sm text-slate-600">Project name readonly<input className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2" value={selectedSetting.project} readOnly /></label><label className="text-sm text-slate-600">Project KPI Type<select className="mt-1 w-full rounded-lg border px-3 py-2" name="project_kpi_type" defaultValue={selectedSetting.project_kpi_type}>{projectKpiTypes.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label>{field("project_start_date", "Project Start Date", selectedSetting.project_start_date, "date")}{check("is_kpi_protection_enabled", "Enable KPI Protection", selectedSetting.is_kpi_protection_enabled)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">KPI Protection Rules</h4><div className="grid gap-4 md:grid-cols-3">{field("performance_floor_pct", "Performance Floor %", selectedSetting.performance_floor_pct, "number")}{field("performance_cap_pct", "Performance Cap %", selectedSetting.performance_cap_pct, "number")}{field("min_coverage_required", "Min Coverage Required", selectedSetting.min_coverage_required, "number")}{field("min_eligible_urls", "Min Eligible URLs", selectedSetting.min_eligible_urls, "number")}{field("max_excluded_no_data_rate", "Max Excluded No Data Rate", selectedSetting.max_excluded_no_data_rate, "number")}{field("require_pm_review_below_pct", "Require PM Review Below %", selectedSetting.require_pm_review_below_pct, "number")}</div><div className="mt-4 grid gap-2 md:grid-cols-3">{check("allow_auto_floor_when_low_confidence", "Allow auto-floor when low confidence", selectedSetting.allow_auto_floor_when_low_confidence)}{check("allow_auto_floor_when_partial_coverage", "Allow auto-floor when partial coverage", selectedSetting.allow_auto_floor_when_partial_coverage)}{check("allow_auto_floor_when_high_no_data", "Allow auto-floor when high no-data", selectedSetting.allow_auto_floor_when_high_no_data)}</div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">PM Override</h4><div className="grid gap-4 md:grid-cols-3">{check("pm_override_enabled", "Enable PM Override", selectedSetting.pm_override_enabled)}{field("pm_override_adjusted_pct", "PM Override Adjusted %", selectedSetting.pm_override_adjusted_pct, "number")}<label className="text-sm text-slate-600 md:col-span-3">PM Override Reason<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="pm_override_reason" defaultValue={selectedSetting.pm_override_reason || ""} /></label></div></section>
        <section><h4 className="mb-3 font-semibold text-slate-800">Notes</h4><label className="text-sm text-slate-600">Notes<textarea className="mt-1 w-full rounded-lg border px-3 py-2" name="notes" defaultValue={selectedSetting.notes || ""} /></label></section>
      </div>
    </form>}

    <div className="overflow-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Project</th><th>Project Type</th><th>Protection Enabled</th><th>Floor %</th><th>Cap %</th><th>PM Override</th><th>Updated At</th><th>Edit</th></tr></thead><tbody>{settings.map((s) => { const a = adjusted.get(s.project); return <tr className="border-t" key={s.project}><td className="p-3 font-medium">{s.project}<div className="text-xs font-normal text-slate-500">Adjusted: {fmtKpi(a?.adjusted_performance_final_pct)}</div></td><td>{s.project_kpi_type.replace(/_/g, " ")}</td><td>{s.is_kpi_protection_enabled ? "Yes" : "No"}</td><td>{fmtKpi(s.performance_floor_pct)}</td><td>{fmtKpi(s.performance_cap_pct)}</td><td>{s.pm_override_enabled ? "Enabled" : "Disabled"}</td><td>{s.updated_at ? new Date(s.updated_at).toLocaleString() : "—"}</td><td><a className="text-blue-700" href={`/admin/project-kpi-settings?project=${encodeURIComponent(s.project)}`}>Edit</a></td></tr>; })}</tbody></table></div>
  </Shell>;
}
