"use client";

import { useMemo, useState } from "react";
import { measurementStrategies } from "../../lib/kpi/project-settings";

const defaults = {
  project: "", projectStartDate: "", measurementStrategy: "growth_project", performanceEnabledForPayroll: false,
  minProjectAgeDays: 90, preWindowDays: 28, postWindowDays: 28, seoLagDays: 28, gscDelayDays: 3,
  minEligibleEvents: 5, minDataCoveragePct: 80, minTotalImpressions: 500,
  stableMinEligibleEvents: 3, stableMinTotalImpressions: 300, zeroSignalScorePct: 0, newSignalScorePct: 60,
  seasonalityMode: "pm_review", controlAdjustmentEnabled: true, performanceRuleVersion: "performance_measurement_v3",
};

function fromRow(row: any) {
  return {
    project: row.project ?? "", projectStartDate: row.project_start_date?.slice?.(0, 10) ?? "",
    measurementStrategy: row.measurement_strategy ?? defaults.measurementStrategy,
    performanceEnabledForPayroll: Boolean(row.performance_enabled_for_payroll), minProjectAgeDays: row.min_project_age_days ?? 90,
    preWindowDays: row.pre_window_days ?? 28, postWindowDays: row.post_window_days ?? 28, seoLagDays: row.seo_lag_days ?? 28,
    gscDelayDays: row.gsc_delay_days ?? 3, minEligibleEvents: row.min_eligible_events ?? 5,
    minDataCoveragePct: row.min_data_coverage_pct ?? 80, minTotalImpressions: row.min_total_impressions ?? 500,
    stableMinEligibleEvents: row.stable_min_eligible_events ?? 3, stableMinTotalImpressions: row.stable_min_total_impressions ?? 300,
    zeroSignalScorePct: row.zero_signal_score_pct ?? 0, newSignalScorePct: row.new_signal_score_pct ?? 60,
    seasonalityMode: row.seasonality_mode ?? "pm_review", controlAdjustmentEnabled: Boolean(row.control_adjustment_enabled),
    performanceRuleVersion: row.performance_rule_version ?? "performance_measurement_v3",
  };
}

export function ProjectSettingsPanel({ initialSettings, featureEnabled }: { initialSettings: any[]; featureEnabled: boolean }) {
  const [rows, setRows] = useState(initialSettings);
  const [form, setForm] = useState<any>(defaults);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => rows.find((row) => row.project === form.project), [rows, form.project]);
  const field = (name: string, value: any) => setForm((current: any) => ({ ...current, [name]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("Saving staging configuration…");
    try {
      const response = await fetch("/api/admin/monthly-kpi-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${payload.error?.message ?? "Save failed"}${payload.error?.requestId ? ` (request ${payload.error.requestId})` : ""}`);
      const saved = payload.setting;
      setRows((current) => [...current.filter((row) => row.project !== saved.project), saved].sort((a, b) => a.project.localeCompare(b.project)));
      setForm(fromRow(saved)); setNotice("Staging configuration saved. Refresh Performance to use this rule snapshot.");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {!featureEnabled && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Writes are disabled because <code>KPI_ENGINE_V2_ENABLED</code> is off.</div>}
    {notice && <div role="status" className="rounded-xl border bg-slate-50 p-4 text-sm">{notice}</div>}
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap gap-3"><label className="text-sm font-semibold">Load existing project<select className="ml-2 rounded-lg border px-3 py-2 font-normal" value={selected?.project ?? ""} onChange={(event) => { const row = rows.find((item) => item.project === event.target.value); setForm(row ? fromRow(row) : defaults); }}><option value="">New configuration</option>{rows.map((row) => <option key={row.project}>{row.project}</option>)}</select></label></div>
      <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Text name="project" label="Project" value={form.project} set={field} required />
        <Text name="projectStartDate" label="Project start date" value={form.projectStartDate} set={field} type="date" />
        <label className="text-sm">Measurement strategy<select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.measurementStrategy} onChange={(event) => field("measurementStrategy", event.target.value)}>{measurementStrategies.map((strategy) => <option key={strategy}>{strategy}</option>)}</select></label>
        <Text name="performanceRuleVersion" label="Performance rule version" value={form.performanceRuleVersion} set={field} required />
        <NumberField name="minProjectAgeDays" label="Minimum project age days" value={form.minProjectAgeDays} set={field} />
        <NumberField name="preWindowDays" label="Pre-window days" value={form.preWindowDays} set={field} min={1} />
        <NumberField name="postWindowDays" label="Post-window days" value={form.postWindowDays} set={field} min={1} />
        <NumberField name="seoLagDays" label="SEO lag days" value={form.seoLagDays} set={field} />
        <NumberField name="gscDelayDays" label="GSC delay days" value={form.gscDelayDays} set={field} />
        <NumberField name="minEligibleEvents" label="Growth/new min events" value={form.minEligibleEvents} set={field} min={1} />
        <NumberField name="minDataCoveragePct" label="Minimum coverage %" value={form.minDataCoveragePct} set={field} max={100} />
        <NumberField name="minTotalImpressions" label="Growth/new min impressions" value={form.minTotalImpressions} set={field} />
        <NumberField name="stableMinEligibleEvents" label="Stable min events" value={form.stableMinEligibleEvents} set={field} min={1} />
        <NumberField name="stableMinTotalImpressions" label="Stable min impressions" value={form.stableMinTotalImpressions} set={field} />
        <NumberField name="zeroSignalScorePct" label="Zero-signal score %" value={form.zeroSignalScorePct} set={field} max={100} />
        <NumberField name="newSignalScorePct" label="New-signal score %" value={form.newSignalScorePct} set={field} max={100} />
        <label className="text-sm">Seasonality mode<select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.seasonalityMode} onChange={(event) => field("seasonalityMode", event.target.value)}><option value="pm_review">PM review</option><option value="control_adjusted">Control adjusted</option><option value="disabled">Disabled</option></select></label>
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={form.controlAdjustmentEnabled} onChange={(event) => field("controlAdjustmentEnabled", event.target.checked)} />Use unaffected URL controls</label>
        <label className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><input type="checkbox" checked={form.performanceEnabledForPayroll} onChange={(event) => field("performanceEnabledForPayroll", event.target.checked)} />Enable Performance for shadow payroll</label>
        <button disabled={busy || !featureEnabled} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-40 md:col-span-2 xl:col-span-4">Save staging lifecycle configuration</button>
      </form>
    </section>
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Project</th><th>Strategy</th><th>Payroll</th><th>Windows / lag</th><th>Events / coverage / impressions</th><th>Control</th><th>Rule</th></tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.project}><td className="p-3 font-semibold">{row.project}</td><td>{row.measurement_strategy}</td><td>{row.performance_enabled_for_payroll ? "Shadow enabled" : "Disabled / N/A"}</td><td>{row.pre_window_days}/{row.post_window_days} · lag {row.seo_lag_days} · GSC {row.gsc_delay_days}</td><td>{row.min_eligible_events} / {row.min_data_coverage_pct}% / {row.min_total_impressions}</td><td>{row.control_adjustment_enabled ? "Enabled" : "Disabled"}</td><td>{row.performance_rule_version}</td></tr>)}</tbody></table></div>
  </div>;
}

function Text({ name, label, value, set, type = "text", required = false }: any) { return <label className="text-sm">{label}<input className="mt-1 w-full rounded-lg border px-3 py-2" name={name} type={type} value={value} required={required} onChange={(event) => set(name, event.target.value)} /></label>; }
function NumberField({ name, label, value, set, min = 0, max }: any) { return <label className="text-sm">{label}<input className="mt-1 w-full rounded-lg border px-3 py-2" type="number" min={min} max={max} value={value} onChange={(event) => set(name, Number(event.target.value))} /></label>; }
