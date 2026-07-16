import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { SchemaMigrationRequired } from "../../../components/schema-migration-required";
import { authOptions } from "../../../lib/auth";
import { checkDbSchemaHealth } from "../../../lib/db-health";
import { listCanonicalDataSource } from "../../../lib/repositories/data-source";
import { formatViDateTime, viLabel, viReason } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";
const displayDate = (value: unknown) =>
  value ? formatViDateTime(value) : "Chưa có";

export default async function DataSourcePage(props: {
  searchParams?: Promise<{
    month?: string;
    member?: string;
    project?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const schema = await checkDbSchemaHealth();
  if (!schema.ok)
    return (
      <Shell email={session.user.email} isAdmin>
        <SchemaMigrationRequired schema={schema} />
      </Shell>
    );
  const page = Math.max(Number(searchParams?.page ?? 1) || 1, 1);
  const data = await listCanonicalDataSource({
    month: searchParams?.month,
    memberName: searchParams?.member,
    project: searchParams?.project,
    status: searchParams?.status,
    page,
    pageSize: 100,
  });
  const { source, gsc, performance } = data.freshness;
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {}))
      if (value && key !== "page") params.set(key, value);
    params.set("page", String(target));
    return `/admin/data-source?${params.toString()}`;
  };
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 3/6
          </p>
          <h2 className="text-3xl font-bold">Nguồn dữ liệu chuẩn</h2>
          <p className="mt-2 text-slate-600">
            Raw row, work record, logical event và canonical URL là bốn đại lượng riêng.
            Content KPI không phụ thuộc việc GSC đã sẵn sàng hay chưa.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Nguồn ghi gần nhất" value={displayDate(source?.finished_at)} />
          <MetricCard label="GSC đến ngày" value={gsc?.latest_complete_date ?? gsc?.data_cutoff ?? "Chưa có"} />
          <MetricCard label="Performance tính gần nhất" value={displayDate(performance?.last_calculated)} />
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <MetricCard label="Raw rows" value={data.counts.raw_rows} />
          <MetricCard label="Valid work records" value={data.counts.valid_work_records} />
          <MetricCard label="Logical events" value={data.counts.logical_events} />
          <MetricCard label="Active canonical URLs" value={data.counts.active_canonical_urls} />
          <MetricCard label="Cần xử lý" value={data.counts.needs_attention} />
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Tháng<input name="month" type="month" defaultValue={searchParams?.month} className="mt-1 block rounded-lg border px-3 py-2" /></label>
          <label className="text-sm">Dự án<select name="project" defaultValue={searchParams?.project} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Tất cả dự án</option>{(data.filterOptions.projects ?? []).map((name: string) => <option key={name}>{name}</option>)}</select></label>
          <label className="text-sm">Thành viên<select name="member" defaultValue={searchParams?.member} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Tất cả thành viên</option>{(data.filterOptions.members ?? []).map((name: string) => <option key={name}>{name}</option>)}</select></label>
          <label className="text-sm">Trạng thái<select name="status" defaultValue={searchParams?.status} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Tất cả trạng thái</option><option value="accepted">Đã chấp nhận</option><option value="pending">Chờ xác nhận</option><option value="pm_review">PM review</option><option value="provisional">Tạm tính</option><option value="observed">GSC có dữ liệu</option><option value="observed_zero">GSC observed zero</option><option value="fetch_error">GSC lỗi</option></select></label>
          <button className="rounded-lg border px-4 py-2 font-semibold">Lọc</button>
        </form>
        <p className="text-sm text-slate-600">Hiển thị {data.rows.length} / {data.total} dòng, trang {data.page} / {data.pageCount}.</p>
        <DataTableContainer>
          <table className="min-w-[1900px] text-sm">
            <thead className="bg-slate-100 text-left">
              <tr className="border-b"><th className="p-3" colSpan={5}>Nguồn và phân loại</th><th colSpan={2}>Content KPI</th><th colSpan={2}>GSC observation</th><th colSpan={2}>Performance readiness</th></tr>
              <tr><th className="p-3">URL</th><th>Dự án</th><th>Thành viên</th><th>Ngày / loại</th><th>Phân loại</th><th>Eligibility</th><th>Review</th><th>Trạng thái</th><th>Cập nhật</th><th>Trạng thái</th><th>Lý do / hành động</th></tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr className="border-t align-top" key={`${row.id}-${row.work_event_id ?? "url"}`}>
                  <td className="max-w-lg truncate p-3 text-blue-700" title={row.url}>{row.url}</td>
                  <td>{row.project || "Chưa xác định"}<br /><span className="text-xs text-slate-500">{row.normalized_domain || "Chưa có domain"}</span></td>
                  <td>{row.event_member_name || row.member_name || "Chưa xác định"}</td>
                  <td>{row.work_date || "Chưa có ngày"} / {viLabel(row.work_type ?? row.content_type ?? "Chưa có loại")}</td>
                  <td>{viLabel(row.classification_status)}</td>
                  <td>{row.content_kpi_eligible ? "Đủ điều kiện" : "Không đủ điều kiện"}</td>
                  <td>{viLabel(row.content_kpi_state)}</td>
                  <td>{viLabel(row.gsc_observation_state)}</td>
                  <td>{row.latest_gsc_metric_date ?? "Chưa tải"}</td>
                  <td>{viLabel(row.performance_readiness_state ?? "Chưa có event")}</td>
                  <td>{viReason(row.performance_readiness_issues?.[0] ?? row.gsc_error ?? row.classification_issues?.[0] ?? "Không có cảnh báo")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
        <nav className="flex items-center justify-between">
          {data.page > 1 ? <Link className="rounded-lg border px-4 py-2" href={pageHref(data.page - 1)}>Trang trước</Link> : <span />}
          {data.page < data.pageCount ? <Link className="rounded-lg border px-4 py-2" href={pageHref(data.page + 1)}>Trang sau</Link> : <span />}
        </nav>
      </div>
    </Shell>
  );
}
