import { DataTableContainer } from "../ui";
import { uiLabel } from "../../lib/ui-labels";

const pct = (value: unknown) => value === null || value === undefined || !Number.isFinite(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
const money = (value: unknown) => value === null || value === undefined ? "N/A" : `${new Intl.NumberFormat("vi-VN").format(Number(value))} VND`;

export function MemberKpiView({ month, memberName, audit }: { month: string; memberName: string; audit: any }) {
  const components = Object.fromEntries((audit.components ?? []).map((row: any) => [row.component_key, row]));
  const result = audit.results?.[0] ?? null;
  const events = audit.events ?? [];
  const differenceSummary = {
    total: audit.differences?.length ?? 0,
    unexplained: audit.differences?.filter((row: any) => Number(row.delta) !== 0 && !row.is_explained).length ?? 0,
  };
  return <div className="space-y-6">
    <header><p className="text-sm font-semibold uppercase text-blue-700">Phiếu shadow của thành viên</p><h2 className="text-3xl font-bold">{memberName} · {month}</h2><p className="mt-2 text-slate-600">Bằng chứng chỉ đọc. Đây chưa phải phiếu payroll production cho đến khi tổ chức phê duyệt và bật production payroll riêng.</p></header>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Kỷ luật" value={pct(components.discipline?.payable_pct)} />
      <Metric label="SEO Content" value={pct(components.seo_content?.payable_pct)} />
      <Metric label="SEO Performance" value={`${pct(components.seo_performance?.payable_pct)} · ${components.seo_performance?.status ?? "N/A"}`} />
      <Metric label="Mạng xã hội / Video" value={pct(components.social_video?.payable_pct)} />
      <Metric label="Kết quả cuối / chi trả shadow" value={`${pct(result?.payable_pct)} · ${money(result?.payout_vnd)}`} />
    </section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Trạng thái bằng chứng</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><Evidence label="Bản chụp" value={result ? `${uiLabel(result.status)} · phiên bản ${result.version}` : "Chưa hoàn tất"} /><Evidence label="So sánh Google Sheets" value={differenceSummary.total ? `${differenceSummary.total} dòng · ${differenceSummary.unexplained} chênh lệch chưa giải thích` : "Chưa ghi nhận"} /><Evidence label="Quy trình" value={uiLabel(audit.workflow?.[0]?.state ?? "draft")} /></div></section>
    <section><h3 className="mb-3 text-lg font-bold">Bằng chứng URL / công việc</h3><DataTableContainer><table className="min-w-full text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Dự án</th><th>Công việc</th><th>Đơn vị</th><th>Chất lượng</th><th>Quy tắc</th></tr></thead><tbody>{events.map((event: any) => <tr className="border-t" key={event.work_event_id}><td className="max-w-lg p-3"><a className="break-all text-blue-700 underline" href={event.canonical_url_snapshot} target="_blank" rel="noreferrer">{event.canonical_url_snapshot}</a></td><td>{event.project}</td><td>{uiLabel(event.work_type)} · {event.work_date}</td><td>{event.unit_value}</td><td>{pct(event.quality_pct)} · {uiLabel(event.review_status ?? "pending")}</td><td>{event.unit_rule_version ?? "N/A"}</td></tr>)}{!events.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Không có bằng chứng công việc cho thành viên và tháng này.</td></tr>}</tbody></table></DataTableContainer></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase text-slate-500">{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>; }
function Evidence({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs uppercase text-slate-500">{label}</span><strong>{value}</strong></div>; }
