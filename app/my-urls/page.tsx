import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { resolveMemberNameByEmail } from "../../lib/member-identity";
import { listMemberCurrentUrls } from "../../lib/repositories/data-source";
import { viLabel } from "../../lib/i18n/vi";

export const dynamic = "force-dynamic";

export default async function MyUrls(props: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (session.user.isAdmin) redirect("/admin/data-source");
  const memberName = await resolveMemberNameByEmail(session.user.email);
  if (!memberName) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const rows = await listMemberCurrentUrls(memberName, month);
  return (
    <Shell email={session.user.email}>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">Không gian thành viên</p>
          <h2 className="text-3xl font-bold">URL của tôi — {month}</h2>
          <p className="mt-2 text-slate-600">Event công việc chuẩn trong tháng, điểm đánh giá và ghi chú của người duyệt.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Event công việc" value={rows.length} />
          <MetricCard label="Đã đánh giá" value={rows.filter((row: any) => row.review_status === "approved").length} />
          <MetricCard label="Đủ điều kiện KPI Nội dung" value={rows.filter((row: any) => row.kpi_ready).length} />
        </div>
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left"><tr><th className="p-3">URL</th><th>Dự án</th><th>Loại</th><th>Ngày</th><th>Trạng thái</th><th>Đánh giá</th><th>Điểm</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {rows.map((row: any) => <tr className="border-t" key={row.work_event_id}><td className="max-w-lg truncate p-3 text-blue-700">{row.url}</td><td>{row.project}</td><td>{viLabel(row.work_type)}</td><td>{row.work_date}</td><td>{viLabel(row.work_status)}</td><td>{viLabel(row.review_status ?? "pending")}</td><td>{row.quality_pct === null || row.quality_pct === undefined ? "N/A" : `${Number(row.quality_pct).toFixed(1)}%`}</td><td>{row.review_notes ?? "—"}</td></tr>)}
              {!rows.length && <tr><td className="p-3 text-slate-500" colSpan={8}>Chưa có event trong tháng.</td></tr>}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
