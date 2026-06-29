"use client";

import { useEffect, useMemo, useState } from "react";

type ApiErrorPayload = { error?: string; errorMessage?: string; code?: string; message?: string; rawPreview?: string };

function syncErrorMessage(payload: ApiErrorPayload) {
  if (payload.code === "GOOGLE_INVALID_CREDENTIALS") return "Google credentials expired. Please sign out and sign in again.";
  if (payload.code === "GOOGLE_PERMISSION_DENIED") return "Your Google account cannot access this Sheet. Share the Sheet with this email or reconnect Google.";
  return payload.error || payload.errorMessage || payload.message || "URL sync failed";
}

type RefreshRun = { id: string; status: string; range_key: string; start_date: string; end_date: string; total_urls: number; processed_urls: number; failed_urls: number; urls_with_data: number; no_data_urls: number; error_message?: string };
type RefreshRangeKey = "current_month" | "previous_month" | "last_3_months" | "last_6_months" | "all_time";
type SyncRun = { id?: string; status: string; total_rows: number; inserted_rows: number; updated_rows: number; deactivated_rows: number; failed_rows: number; error_message?: string; created_at: string };

type JsonSafeResult<T = any> = { ok: true; data: T } | { ok: false; error: string; status: number; endpoint: string; rawPreview?: string };
type RefreshWorkflowStepStatus = "pending" | "running" | "success" | "failed" | "skipped";
type RefreshWorkflowStepType = "sync" | "refresh";
export type RefreshWorkflowStep = {
  id: string;
  label: string;
  type: RefreshWorkflowStepType;
  rangeKey?: RefreshRangeKey;
  status: RefreshWorkflowStepStatus;
  result?: unknown;
  error?: string;
};

type WorkflowResult = { ok: true; steps: RefreshWorkflowStep[] } | { ok: false; failedStep: RefreshWorkflowStep; steps: RefreshWorkflowStep[]; error: string };

const workflowStepTemplate: RefreshWorkflowStep[] = [
  { id: "sync_sheet", label: "Sync URLs from Sheet", type: "sync", status: "pending" },
  { id: "current_month", label: "Current month", type: "refresh", rangeKey: "current_month", status: "pending" },
  { id: "previous_month", label: "Previous month", type: "refresh", rangeKey: "previous_month", status: "pending" },
  { id: "last_3_months", label: "Last 3 months", type: "refresh", rangeKey: "last_3_months", status: "pending" },
  { id: "last_6_months", label: "Last 6 months", type: "refresh", rangeKey: "last_6_months", status: "pending" },
  { id: "all_time", label: "All time", type: "refresh", rangeKey: "all_time", status: "pending" },
];

function createWorkflowSteps() {
  return workflowStepTemplate.map((step) => ({ ...step, status: "pending" as const, result: undefined, error: undefined }));
}

async function readJsonSafe<T = any>(response: Response, endpoint: string): Promise<JsonSafeResult<T>> {
  const text = await response.text();
  const status = response.status;
  if (!text.trim()) {
    return { ok: false, status, endpoint, error: `HTTP ${status} from ${endpoint}: empty response body` };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    const rawPreview = text.slice(0, 500);
    return { ok: false, status, endpoint, rawPreview, error: `HTTP ${status} from ${endpoint}: response was not JSON. Preview: ${rawPreview}` };
  }
}

function apiError(endpoint: string, response: Response, payload: ApiErrorPayload) {
  const rawPreview = payload?.rawPreview ? ` Preview: ${payload.rawPreview}` : "";
  return `HTTP ${response.status} from ${endpoint}: ${payload?.error || payload?.errorMessage || payload?.message || response.statusText || "Request failed"}${rawPreview}`;
}

async function postSyncSheet() {
  const endpoint = "/api/sync/sheet";
  const response = await fetch(endpoint, { method: "POST" });
  const json = await readJsonSafe<ApiErrorPayload & Record<string, unknown>>(response, endpoint);
  if (!json.ok) throw new Error(json.error);
  const data = json.data;
  if (!response.ok || data.ok === false || data.status === "failed") throw new Error(syncErrorMessage(data));
  return data;
}

async function postRefreshCache(rangeKey: RefreshRangeKey) {
  const endpoint = "/api/refresh/cache";
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ range_key: rangeKey }) });
  const json = await readJsonSafe<ApiErrorPayload & Record<string, unknown>>(response, endpoint);
  if (!json.ok) throw new Error(json.error);
  const data = json.data;
  if (!response.ok || data.ok === false) throw new Error(apiError(endpoint, response, data));
  return data;
}

export async function runRefreshWorkflow({ initialSteps, startIndex = 0, onStepsChange }: { initialSteps?: RefreshWorkflowStep[]; startIndex?: number; onStepsChange: (steps: RefreshWorkflowStep[]) => void }): Promise<WorkflowResult> {
  let steps: RefreshWorkflowStep[] = (initialSteps?.length ? initialSteps : createWorkflowSteps()).map((step, index): RefreshWorkflowStep => ({
    ...step,
    status: index < startIndex && step.status === "success" ? "success" as const : index < startIndex ? "skipped" as const : "pending" as const,
    error: index >= startIndex ? undefined : step.error,
  }));
  onStepsChange(steps);

  for (let index = startIndex; index < steps.length; index += 1) {
    steps = steps.map((step, stepIndex) => stepIndex === index ? { ...step, status: "running", error: undefined } : step);
    onStepsChange(steps);
    const currentStep = steps[index];

    try {
      const result = currentStep.type === "sync" ? await postSyncSheet() : await postRefreshCache(currentStep.rangeKey!);
      steps = steps.map((step, stepIndex) => stepIndex === index ? { ...step, status: "success", result } : step);
      onStepsChange(steps);
    } catch (err) {
      const message = err instanceof Error ? err.message : `${currentStep.label} failed`;
      steps = steps.map((step, stepIndex) => stepIndex === index ? { ...step, status: "failed", error: message } : stepIndex > index ? { ...step, status: "skipped" } : step);
      onStepsChange(steps);
      return { ok: false, failedStep: { ...steps[index], error: message, status: "failed" }, steps, error: message };
    }
  }

  return { ok: true, steps };
}

function statusClassName(status: RefreshWorkflowStepStatus) {
  if (status === "success") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-800 ring-red-200";
  if (status === "running") return "bg-blue-50 text-blue-800 ring-blue-200";
  if (status === "skipped") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

function resultSummary(data: any) {
  if (!data) return "";
  if (typeof data.insertedRows !== "undefined") return `Inserted ${data.insertedRows}, updated ${data.updatedRows}, deactivated ${data.deactivatedRows}, failed ${data.failedRows}.`;
  if (typeof data.totalUrls !== "undefined") return `Processed ${data.processedUrls}/${data.totalUrls}; ${data.urlsWithData} with data, ${data.noDataUrls} no data, ${data.failedUrls} failed.`;
  return "Completed.";
}

export function AdminDataControls({ range = "current_month" }: { range?: string; startDate?: string; endDate?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [refreshRuns, setRefreshRuns] = useState<RefreshRun[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<RefreshWorkflowStep[]>(createWorkflowSteps());
  const [lastWorkflowResult, setLastWorkflowResult] = useState<WorkflowResult | null>(null);

  const completedCount = useMemo(() => workflowSteps.filter((step) => step.status === "success").length, [workflowSteps]);
  const failedStepIndex = workflowSteps.findIndex((step) => step.status === "failed");
  const showWorkflow = loading === "workflow" || lastWorkflowResult || workflowSteps.some((step) => step.status !== "pending");

  async function loadStatus() {
    const endpoint = "/api/health/cache";
    const healthRes = await fetch(endpoint);
    const json = await readJsonSafe<{ latestRefreshRuns?: RefreshRun[]; latestSyncRuns?: SyncRun[] }>(healthRes, endpoint);
    if (json.ok && healthRes.ok) {
      setRefreshRuns(json.data.latestRefreshRuns ?? []);
      setSyncRuns(json.data.latestSyncRuns ?? []);
    }
  }

  useEffect(() => { loadStatus().catch(() => undefined); }, []);

  async function runWorkflowFrom(startIndex = 0) {
    setLoading("workflow"); setError(null); setMessage(null);
    try {
      const baseSteps = startIndex === 0 ? createWorkflowSteps() : workflowSteps;
      const result = await runRefreshWorkflow({ initialSteps: baseSteps, startIndex, onStepsChange: setWorkflowSteps });
      setLastWorkflowResult(result);
      if (result.ok) setMessage("Sync and all performance refresh ranges completed successfully.");
      else setError(`${result.failedStep.label} failed: ${result.error}`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync and refresh workflow failed");
    } finally { setLoading(null); }
  }

  async function runSingleAction(action: "sync" | RefreshRangeKey) {
    setLoading(action); setError(null); setMessage(null);
    try {
      const data = action === "sync" ? await postSyncSheet() : await postRefreshCache(action);
      setMessage(action === "sync" ? `Sheet sync complete. ${resultSummary(data)}` : `${workflowStepTemplate.find((step) => step.rangeKey === action)?.label ?? range} refresh complete. ${resultSummary(data)}`);
      await loadStatus();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setLoading(null); }
  }

  return <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Performance cache refresh</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">Sync URLs from Sheet, then refresh current month, previous month, last 3 months, last 6 months, and all time.</p>
          </div>
          <button className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => runWorkflowFrom(0)} disabled={!!loading}>{loading === "workflow" ? "Syncing & refreshing…" : "Sync & Refresh All Performance"}</button>
        </div>
        {showWorkflow && <div className="mt-5 rounded-xl border border-white/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-slate-900">Refresh progress</h4><span className="text-sm text-slate-600">{completedCount} / {workflowSteps.length} steps completed</span></div>
          <ol className="space-y-2">{workflowSteps.map((step) => <li key={step.id} className="rounded-lg border border-slate-100 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-slate-900">{step.label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClassName(step.status)}`}>{step.status}</span></div>{step.status === "success" && <p className="mt-1 text-xs text-slate-500">{resultSummary(step.result)}</p>}{step.status === "failed" && step.error && <p className="mt-1 text-xs text-red-700">{step.error}</p>}</li>)}</ol>
          {failedStepIndex >= 0 && <button className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60" onClick={() => runWorkflowFrom(failedStepIndex)} disabled={!!loading}>Retry from failed step</button>}
        </div>}
        {message && <p className="mt-3 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent cache activity</h3>
        <div className="mt-3 grid gap-4"><div><h4 className="font-semibold">Latest sync runs</h4><table className="mt-2 w-full text-xs"><tbody>{syncRuns.slice(0, 4).map((r, i) => <tr className="border-t border-slate-200" key={r.id ?? i}><td className="py-1 pr-2 font-medium">{r.status}</td><td className="pr-2">{r.inserted_rows}/{r.updated_rows}/{r.deactivated_rows}/{r.failed_rows}</td><td className="text-slate-500">{String(r.created_at).slice(0,19)}</td></tr>)}{!syncRuns.length && <tr><td className="py-1 text-slate-500">No sync runs yet.</td></tr>}</tbody></table></div><div><h4 className="font-semibold">Latest refresh runs</h4><table className="mt-2 w-full text-xs"><tbody>{refreshRuns.slice(0, 5).map((j) => <tr className="border-t border-slate-200" key={j.id}><td className="py-1 pr-2 font-medium">{j.status}</td><td className="pr-2">{j.processed_urls}/{j.total_urls}</td><td className="pr-2">{j.range_key}</td><td className="text-slate-500">{j.error_message}</td></tr>)}{!refreshRuns.length && <tr><td className="py-1 text-slate-500">No refresh runs yet.</td></tr>}</tbody></table></div></div>
      </div>
    </div>
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced refresh options</summary>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60" onClick={() => runSingleAction("sync")} disabled={!!loading}>{loading === "sync" ? "Syncing…" : "Sync only"}</button>
        {workflowStepTemplate.filter((step) => step.type === "refresh").map((step) => <button key={step.id} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60" onClick={() => runSingleAction(step.rangeKey!)} disabled={!!loading}>{loading === step.rangeKey ? "Refreshing…" : `Refresh ${step.label.toLowerCase()} only`}</button>)}
      </div>
    </details>
  </div>;
}
