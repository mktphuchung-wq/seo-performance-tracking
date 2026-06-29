"use client";

import { useState } from "react";

type ApiErrorPayload = { error?: string; errorMessage?: string; code?: string };

function syncErrorMessage(payload: ApiErrorPayload) {
  if (payload.code === "GOOGLE_INVALID_CREDENTIALS") return "Google credentials expired. Please sign out and sign in again.";
  if (payload.code === "GOOGLE_PERMISSION_DENIED") return "Your Google account cannot access this Sheet. Share the Sheet with this email or reconnect Google.";
  return payload.error || payload.errorMessage || "URL sync failed";
}

type SheetSyncResult = {
  status: "success" | "failed";
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  deactivatedRows: number;
  failedRows: number;
  errorMessage?: string;
};

export function SheetSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SheetSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncUrls() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/sync/sheet", { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.ok === false || data.status === "failed") throw new Error(syncErrorMessage(data));
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL sync failed");
    } finally {
      setLoading(false);
    }
  }

  return <div className="rounded-xl border bg-white p-4">
    <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="button" onClick={syncUrls} disabled={loading}>
      {loading ? "Syncing URLs…" : "Sync URLs from Sheet"}
    </button>
    {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    {result && <div className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
      <div><strong>{result.totalRows}</strong><br />total rows read</div>
      <div><strong>{result.insertedRows}</strong><br />inserted rows</div>
      <div><strong>{result.updatedRows}</strong><br />updated rows</div>
      <div><strong>{result.deactivatedRows}</strong><br />deactivated rows</div>
      <div><strong>{result.failedRows}</strong><br />failed rows</div>
      {result.errorMessage && <p className="col-span-full text-red-700">{result.errorMessage}</p>}
    </div>}
  </div>;
}
