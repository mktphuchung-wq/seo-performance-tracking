import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { RuleEditor } from "../../../components/rule-editor";
import { authOptions } from "../../../lib/auth";
import { formatViDateTime, viLabel } from "../../../lib/i18n/vi";
import { getRuleRegistry } from "../../../lib/services/rule-service";

export const dynamic = "force-dynamic";
type Tab = "performance" | "work_units" | "quality" | "final_kpi";

export default async function RulesPage(props: { searchParams?: Promise<{ tab?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const requested = (await props.searchParams)?.tab;
  const tab: Tab = (["performance", "work_units", "quality", "final_kpi"] as string[]).includes(requested ?? "") ? requested as Tab : "performance";
  const registry = await getRuleRegistry();
  const tabs: Array<[Tab, string]> = [["performance", "Performance"], ["work_units", "Work units"], ["quality", "Quality"], ["final_kpi", "Final KPI"]];
  const rows: any[] = tab === "performance" ? [...registry.performance, ...registry.projectSettings] : tab === "work_units" ? registry.workUnits : tab === "quality" ? registry.quality : registry.finalKpi;
  const today = new Date().toISOString().slice(0, 10);
  const active = rows.filter((row) => row.status === "approved" && String(row.effective_from ?? row.valid_from ?? "") <= today && (!row.effective_to && !row.valid_to || String(row.effective_to ?? row.valid_to) >= today));
  const upcoming = rows.filter((row) => String(row.effective_from ?? row.valid_from ?? "") > today);
  return <Shell email={session.user.email} isAdmin><div className="space-y-6">
    <header><p className="text-sm font-semibold uppercase text-blue-700">Quản trị có phiên bản</p><h2 className="text-3xl font-bold">Rules — Cấu hình</h2><p className="mt-2 text-slate-600">Mỗi thay đổi tạo version mới với effective date, lý do, người duyệt và audit. Version đã dùng bởi KPI locked không bị sửa ngược.</p></header>
    <nav className="flex flex-wrap gap-2">{tabs.map(([key, label]) => <Link className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === key ? "bg-slate-950 text-white" : "bg-white"}`} href={`?tab=${key}`} key={key}>{label}</Link>)}</nav>
    <div className="grid gap-4 md:grid-cols-3"><MetricCard label="Version hiện có" value={rows.length} /><MetricCard label="Đang active" value={active.length} /><MetricCard label="Upcoming / draft" value={upcoming.length + rows.filter((row) => row.status === "draft").length} /></div>
    {tab === "performance" ? <section className="rounded-2xl border bg-white p-5"><h3 className="font-semibold">Performance và lifecycle theo dự án</h3><p className="mt-2 text-sm text-slate-600">Các threshold, coverage/confidence và trọng số 3T/6T/Toàn thời gian được quản lý theo từng dự án. Current month chỉ là diagnostic.</p><Link className="mt-4 inline-flex rounded-lg border px-4 py-2 font-semibold text-blue-700" href="/admin/projects">Mở cấu hình dự án và tạo version</Link></section> : <RuleEditor family={tab} />}
    <section className="space-y-3"><h3 className="text-xl font-semibold">Lịch sử version</h3><DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Scope / tên</th><th>Version</th><th>Effective</th><th>Status</th><th>Thông số</th><th>Lý do</th><th>Người tạo / duyệt</th></tr></thead><tbody>{rows.map((row: any, index) => <tr className="border-t align-top" key={`${row.id}-${index}`}><td className="p-3 font-semibold">{row.project ?? row.rubric_key ?? row.template_key ?? "Global"}<br/><span className="text-xs font-normal text-slate-500">{row.member_name ?? row.lifecycle ?? row.work_type ?? row.name ?? ""}</span></td><td>{row.version ?? row.rule_version}</td><td>{row.effective_from ?? row.valid_from ?? "N/A"}{row.effective_to || row.valid_to ? ` → ${row.effective_to ?? row.valid_to}` : ""}</td><td>{viLabel(row.status)}</td><td>{tab === "work_units" ? `${row.difficulty}: ${row.unit_value} unit` : tab === "quality" ? `${row.total_weight_pct}% · ${row.criteria?.length ?? 0} criteria` : tab === "final_kpi" ? (row.components ?? []).map((item: any) => `${item.componentKey} ${item.weightPct}%`).join(" · ") : `${row.performance_weight_3m_pct ?? row.min_known_coverage_pct ?? "—"}`}</td><td>{row.reason ?? "N/A"}</td><td>{row.created_by ?? "N/A"}<br/><span className="text-xs text-slate-500">{row.approved_by ? `Duyệt: ${row.approved_by}` : "Chưa duyệt"}</span></td></tr>)}{!rows.length && <tr><td className="p-4 text-slate-500" colSpan={7}>Chưa có version.</td></tr>}</tbody></table></DataTableContainer></section>
    <section className="space-y-3"><h3 className="text-xl font-semibold">Audit gần nhất</h3><DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Thời gian</th><th>Actor</th><th>Action</th><th>Entity</th><th>Lý do</th></tr></thead><tbody>{registry.audit.slice(0, 20).map((row: any) => <tr className="border-t" key={row.id}><td className="p-3">{formatViDateTime(row.created_at)}</td><td>{row.actor}</td><td>{row.action}</td><td>{row.entity_type} / {row.entity_id}</td><td>{row.reason}</td></tr>)}</tbody></table></DataTableContainer></section>
  </div></Shell>;
}
