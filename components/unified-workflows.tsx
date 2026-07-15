"use client";

import { useState } from "react";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: `${response.status} ${response.statusText}` }));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
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
  if (!response.ok) throw new Error(data.error ?? "Request failed");
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
  const [busy, setBusy] = useState(false);
  const [previewRunId, setPreviewRunId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson("/api/admin/source-pipeline/preview", {});
      setPreviewRunId(String(data.syncRunId ?? ""));
      setMessage(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Source preview failed");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson("/api/admin/source-pipeline/commit", {
        previewRunId,
        approvalReason: reason,
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Source commit failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">
        Content Sheet → canonical source
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Check source changes validates the exact five-column contract without
        changing Canonical URLs or Work events. Apply uses the reviewed Preview
        run and is idempotent.
      </p>
      <label className="mt-4 block text-sm font-medium">
        Admin reason
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Approved counts, aliases, and needs-attention rows"
        />
      </label>
      {previewRunId && (
        <p className="mt-2 text-xs text-slate-500">
          Preview run: <span className="font-mono">{previewRunId}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-lg border px-4 py-2 font-semibold"
          disabled={busy}
          onClick={preview}
        >
          Check for source changes
        </button>
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy || !reason.trim() || !previewRunId}
          onClick={commit}
        >
          Apply accepted changes
        </button>
      </div>
      <Result message={message} error={error} />
    </section>
  );
}

export type ProjectOption = {
  project: string;
  approvedGscProperty: string | null;
  canonicalDomain: string | null;
  domainConflict: boolean;
  detectedDomains: Array<{ domain: string; urlCount: number }>;
  current?: {
    lifecycle?: string | null;
    gsc_property?: string | null;
    effective_from?: string | null;
    performance_weight_3m_pct?: number | null;
    performance_weight_6m_pct?: number | null;
    performance_weight_all_time_pct?: number | null;
  } | null;
};
export function ProjectSettingsForm({
  options,
  gscProperties,
}: {
  options: ProjectOption[];
  gscProperties: Array<{ siteUrl: string; permissionLevel: string }>;
}) {
  const [selectedProject, setSelectedProject] = useState(
    options[0]?.project ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = options.find((option) => option.project === selectedProject);
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
        },
      );
      setMessage(JSON.stringify(data, null, 2));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-6 shadow-sm"
    >
      <h3 className="text-lg font-semibold">Project Settings</h3>
      <p className="mt-1 text-sm text-slate-600">
        Project and domain come from synced/configured data. Readiness and
        version are derived automatically.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm">
          Project
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
          Canonical domain
          <input
            type="hidden"
            name="canonicalDomain"
            value={selected?.canonicalDomain ?? ""}
          />
          <select
            value={selected?.canonicalDomain ?? ""}
            disabled
            className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2"
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
              Multiple hostnames detected; the dominant hostname is preselected.
            </span>
          )}
        </label>
        <label className="text-sm">
          Lifecycle
          <select
            key={`lifecycle-${selectedProject}`}
            name="lifecycle"
            defaultValue={selected?.current?.lifecycle ?? "new_project"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="new_project">New Project</option>
            <option value="growth_project">Growth Project</option>
            <option value="stable_project">Stable Project</option>
          </select>
        </label>
        <label className="text-sm">
          GSC property
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
            <option value="">Not selected</option>
            {properties.map((property) => (
              <option key={property}>{property}</option>
            ))}
          </select>
          {!propertyAccessible && gscProperties.length > 0 && (
            <span className="mt-1 block text-xs text-red-700">
              The configured property is not accessible to this Google session.
            </span>
          )}
        </label>
        <Field
          key={`3m-${selectedProject}`}
          name="threeMonthWeight"
          label="3M weight %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_3m_pct ?? undefined
          }
        />
        <Field
          key={`6m-${selectedProject}`}
          name="sixMonthWeight"
          label="6M weight %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_6m_pct ?? undefined
          }
        />
        <Field
          key={`all-${selectedProject}`}
          name="allTimeWeight"
          label="All Time weight %"
          type="number"
          defaultValue={
            selected?.current?.performance_weight_all_time_pct ?? undefined
          }
        />
        <Field
          key={`effective-${selectedProject}`}
          name="effectiveMonth"
          label="Effective month"
          type="month"
          required
          defaultValue={
            selected?.current?.effective_from?.slice(0, 7) ??
            new Date().toISOString().slice(0, 7)
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="approve" />
          Approve this version
        </label>
        <label className="text-sm md:col-span-3">
          Audit reason (required for overrides/changes)
          <textarea
            name="reason"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>
      <button className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        Save Project Settings
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
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          As-of month
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
          Refresh Performance Service
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
};
export function QualityReviewEditor({
  month,
  workEventId,
  criteria,
}: {
  month: string;
  workEventId: string;
  criteria: ReviewCriterion[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const answers = criteria.map((criterion, index) => {
        const isNa = form.get(`na-${index}`) === "on";
        const note = String(form.get(`note-${index}`) ?? "");
        return {
          criterionKey: criterion.criterionKey,
          score: isNa ? null : Number(form.get(`score-${index}`)),
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
        `Saved ${Number(data.reviews?.[0]?.qualityPct ?? 0).toFixed(1)}%`,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review save failed");
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
            >
              <option value="5">5 — Excellent</option>
              <option value="4">4 — Meets</option>
              <option value="3">3 — Acceptable</option>
              <option value="2">2 — Weak</option>
              <option value="1">1 — Poor</option>
              <option value="0">0 — Missing</option>
            </select>
            {criterion.allowsNa && (
              <span className="mt-1 flex items-center gap-2">
                <input name={`na-${index}`} type="checkbox" />
                Not applicable (reason required)
              </span>
            )}
            <input
              name={`note-${index}`}
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="Evidence for low score or N/A reason"
            />
          </label>
        ))}
      </div>
      <textarea
        name="adminNote"
        className="mt-3 w-full rounded border px-3 py-2 text-sm"
        placeholder="Reviewer notes"
      />
      <button className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
        Approve URL review
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
      setError(err instanceof Error ? err.message : "Target save failed");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">Member monthly Min post / target units</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Member
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
        <Field name="targetUnits" label="Target units" type="number" required />
        <Field
          name="baseTargetUnits"
          label="Base target"
          type="number"
          required
        />
        <Field
          name="activeWorkdayRatio"
          label="Workday ratio (0–1)"
          type="number"
          required
        />
        <Field name="adjustmentReason" label="Adjustment reason" />
      </div>
      <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        Save member target
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
      setError(err instanceof Error ? err.message : "Configuration failed");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">Member × Month Final KPI configuration</h3>
      <p className="mt-1 text-sm text-slate-600">
        Weights are versioned for this member only. Applied weights must total
        100%. Locked configuration must be reopened before editing.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Member
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
          Social + Video enabled
        </label>
        <span
          className={`self-end rounded px-3 py-2 text-sm ${total === 100 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          Total: {total}%
        </span>
        <label className="text-sm">
          SEO Content %
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
          SEO Performance %
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
          Configuration reason
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
          ? "Reopen locked version to edit"
          : "Approve member configuration"}
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
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }
  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold">Final KPI preview</h3>
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
            Calculate selected member
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
            placeholder="Score 0–100"
          />
          <label className="flex items-center gap-2 text-sm">
            <input id="social-na" type="checkbox" />
            N/A
          </label>
          <input
            id="social-reason"
            className="rounded border px-3 py-2"
            placeholder="Note, evidence, or N/A reason"
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
          Save Social + Video
        </button>
      </div>
      <div>
        <h3 className="font-semibold">Finalize and lock</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <select id="close-member" className="rounded border px-3 py-2">
            {members.map((member) => (
              <option key={member}>{member}</option>
            ))}
          </select>
          <input
            id="close-reason"
            className="rounded border px-3 py-2"
            placeholder="Missing Performance acknowledgement reason"
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
            Finalize & lock
          </button>
        </div>
      </div>
      {lockedResults.length > 0 && (
        <div>
          <h3 className="font-semibold">Reopen locked version</h3>
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
              placeholder="Authorized reopen reason"
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
              Reopen as new version
            </button>
          </div>
        </div>
      )}
      <Result message={message} error={error} />
    </section>
  );
}
