"use client";

import { useEffect, useState } from "react";

type Job = { id: string; status: string; range_key: string; start_date: string; end_date: string; total_items: number; complete_items: number; failed_items: number; processed_urls?: number; failed_urls?: number; error_message?: string };
type SyncRun = { id?: string; status: string; total_rows: number; inserted_rows: number; updated_rows: number; deactivated_rows: number; failed_rows: number; error_message?: string; created_at: string };

type JsonSafeResult<T = any> = { ok: true; data: T } | { ok: false; error: string; status: number; endpoint: string; rawPreview?: string };

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

function apiError(endpoint: string, response: Response, payload: any) {
  const rawPreview = payload?.rawPreview ? ` Preview: ${payload.rawPreview}` : "";
  return `HTTP ${response.status} from ${endpoint}: ${payload?.error || payload?.message || response.statusText || "Request failed"}${rawPreview}`;
}

export function AdminDataControls({ range = "28d", startDate, endDate }: { range?: string; startDate?: string; endDate?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);

  async function loadStatus() {
    const healthRes = await fetch("/api/health/cache");
    if (healthRes.ok) {
      const health = await healthRes.json();
      setJobs(health.latestRefreshRuns ?? []);
      setSyncRuns(health.latestSyncRuns ?? []);
    }
  }

  useEffect(() => { loadStatus().catch(() => undefined); }, []);

  async function syncSheet() {
    setLoading("sync"); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/sync/sheet", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.status === "failed") throw new Error(data.error || data.errorMessage || "URL sync failed");
      setMessage(`Sheet sync complete: ${data.insertedRows} inserted, ${data.updatedRows} updated, ${data.deactivatedRows} deactivated, ${data.failedRows} failed.`);
      await loadStatus();
    } catch (err) { setError(err instanceof Error ? err.message : "URL sync failed"); }
    finally { setLoading(null); }
  }

  async function refreshGsc() {
    setLoading("refresh"); setError(null); setMessage(null);
    try {
      const endpoint = "/api/refresh/cache";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ range, startDate, endDate }) });
      const json = await readJsonSafe(response, endpoint);
      if (!json.ok) throw new Error(json.error);
      const data = json.data;
      if (!response.ok || data.ok === false) throw new Error(apiError(endpoint, response, data));
      setMessage(`GSC refresh result: total URLs ${data.totalUrls}; processed URLs ${data.processedUrls}; URLs with GSC data ${data.urlsWithData}; URLs with no data ${data.noDataUrls}; failed URLs ${data.failedUrls}${data.errorMessage ? `; error: ${data.errorMessage}` : ""}.`);
      await loadStatus();
    } catch (err) { setError(err instanceof Error ? err.message : "Refresh failed"); }
    finally { setLoading(null); }
  }

  return <div className="mb-6 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap gap-3">
      <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" onClick={syncSheet} disabled={!!loading}>{loading === "sync" ? "Syncing URLs…" : "Sync URLs from Sheet"}</button>
      <button className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" onClick={refreshGsc} disabled={!!loading}>{loading === "refresh" ? "Refreshing GSC…" : "Refresh GSC Performance"}</button>
    </div>
    {message && <p className="mt-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div><h3 className="font-semibold">Latest sync runs</h3><table className="mt-2 w-full text-xs"><tbody>{syncRuns.map((r, i) => <tr className="border-t" key={r.id ?? i}><td className="py-1">{r.status}</td><td>{r.inserted_rows}/{r.updated_rows}/{r.deactivated_rows}/{r.failed_rows}</td><td>{String(r.created_at).slice(0,19)}</td></tr>)}{!syncRuns.length && <tr><td className="py-1 text-slate-500">No sync runs yet.</td></tr>}</tbody></table></div>
      <div><h3 className="font-semibold">Latest refresh runs</h3><table className="mt-2 w-full text-xs"><tbody>{jobs.map((j) => <tr className="border-t" key={j.id}><td className="py-1">{j.status}</td><td>{j.complete_items}/{j.total_items} done</td><td>{j.failed_items} failed</td><td>{String(j.range_key)}</td><td>{j.error_message}</td></tr>)}{!jobs.length && <tr><td className="py-1 text-slate-500">No refresh runs yet.</td></tr>}</tbody></table></div>
    </div>
  </div>;
}
