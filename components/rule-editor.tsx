"use client";

import { useState } from "react";

type Family = "work_units" | "quality" | "final_kpi";
const today = new Date().toISOString().slice(0, 10);
const versionDefault = `v${today.replaceAll("-", ".")}`;

export function RuleEditor({ family }: { family: Family }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const common = { family, version: form.get("version"), effectiveFrom: form.get("effectiveFrom"), reason: form.get("reason"), approve: form.get("approve") === "on" };
      const payload: any = family === "work_units" ? { ...common, rules: [{ project: form.get("project") || null, memberName: form.get("memberName") || null, workType: form.get("workType"), difficulty: form.get("difficulty"), unitValue: Number(form.get("unitValue")) }] }
        : family === "quality" ? { ...common, rubricKey: form.get("rubricKey"), name: form.get("name"), project: form.get("project") || null, workType: form.get("workType"), criteria: JSON.parse(String(form.get("criteria"))) }
        : { ...common, templateKey: "monthly_seo_kpi", name: form.get("name"), components: [
          { componentKey: "seo_content", weightPct: Number(form.get("seoContent")), isRequired: true, allowsNa: false, displayOrder: 10 },
          { componentKey: "seo_performance", weightPct: Number(form.get("seoPerformance")), isRequired: false, allowsNa: true, displayOrder: 20 },
          { componentKey: "social_video", weightPct: Number(form.get("socialVideo")), isRequired: false, allowsNa: true, displayOrder: 30 },
        ] };
      const response = await fetch("/api/admin/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message ?? result.error ?? "Không thể lưu rule.");
      setMessage(`Đã tạo version ${result.version.version ?? common.version}. Tải lại trang để xem lịch sử.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lưu rule."); }
    finally { setPending(false); }
  }
  return <form className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={submit}>
    <h3 className="text-lg font-semibold">Tạo rule version mới</h3>
    <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Version<input name="version" required defaultValue={versionDefault} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Effective date<input name="effectiveFrom" type="date" required defaultValue={today} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Lý do thay đổi<input name="reason" required minLength={5} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label></div>
    {family === "work_units" && <div className="grid gap-3 md:grid-cols-5"><label className="text-sm">Project (trống = global)<input name="project" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Member (tùy chọn)<input name="memberName" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Loại<select name="workType" className="mt-1 block w-full rounded-lg border px-3 py-2"><option value="new_content">New content</option><option value="update">Update</option><option value="audit">Audit</option><option value="portfolio">Portfolio</option></select></label><label className="text-sm">Difficulty<input name="difficulty" required defaultValue="normal" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Unit value<input name="unitValue" required type="number" min="0" step="0.01" defaultValue="1" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label></div>}
    {family === "quality" && <><div className="grid gap-3 md:grid-cols-4"><label className="text-sm">Rubric key<input name="rubricKey" required defaultValue="seo_content" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Tên rubric<input name="name" required defaultValue="SEO Content Quality" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Project (tùy chọn)<input name="project" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Work type<select name="workType" className="mt-1 block w-full rounded-lg border px-3 py-2"><option value="new_content">New content</option><option value="update">Update</option><option value="audit">Audit</option></select></label></div><label className="block text-sm">Criteria JSON (tổng weight = 100)<textarea name="criteria" rows={7} className="mt-1 block w-full rounded-lg border p-3 font-mono text-xs" defaultValue={JSON.stringify([{ key: "structure", name: "Structure", weightPct: 20, allowsNa: false },{ key: "content", name: "Content", weightPct: 30, allowsNa: false },{ key: "metadata", name: "Metadata", weightPct: 20, allowsNa: true },{ key: "image_video", name: "Image / Video", weightPct: 15, allowsNa: true },{ key: "links", name: "Links", weightPct: 15, allowsNa: true }], null, 2)} /></label></>}
    {family === "final_kpi" && <><label className="block text-sm">Tên template<input name="name" required defaultValue="Monthly SEO KPI" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Quantity + Quality / SEO Content<input name="seoContent" required type="number" min="0" max="100" defaultValue="80" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">SEO Performance<input name="seoPerformance" required type="number" min="0" max="100" defaultValue="20" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Social + Video / N/A<input name="socialVideo" required type="number" min="0" max="100" defaultValue="0" className="mt-1 block w-full rounded-lg border px-3 py-2" /></label></div></>}
    <label className="flex items-center gap-2 text-sm"><input name="approve" type="checkbox" />Duyệt version ngay (nếu bỏ chọn sẽ lưu draft)</label>
    <button disabled={pending} className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Đang lưu…" : "Tạo version"}</button>{message && <p role="status" className="text-sm text-blue-700">{message}</p>}
  </form>;
}
