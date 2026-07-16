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
  searchParams?: Promise<{ month?: string; member?: string }>;
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
  const month = searchParams?.month;
  const member = searchParams?.member;
  const data = await listCanonicalDataSource({ month, memberName: member });
  const members = [
    ...new Set(data.rows.map((row: any) => row.member_name).filter(Boolean)),
  ] as string[];
  const accepted = data.rows.filter(
    (row: any) => row.classification_status === "accepted",
  );
  const { source, gsc, performance } = data.freshness;
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 3/6
          </p>
          <h2 className="text-3xl font-bold">Nguồn dữ liệu chuẩn</h2>
          <p className="mt-2 text-slate-600">
            Trạng thái phân loại, dữ liệu GSC thực tế, eligibility Nội dung và
            eligibility Hiệu suất được theo dõi độc lập. Dữ liệu thiếu giữ nguyên N/A.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Nguồn được ghi gần nhất"
            value={displayDate(source?.finished_at)}
          />
          <MetricCard
            label="Dữ liệu GSC đến ngày"
            value={gsc?.latest_complete_date ?? gsc?.data_cutoff ?? "N/A"}
          />
          <MetricCard
            label="Hiệu suất tính gần nhất"
            value={displayDate(performance?.last_calculated)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="URL chuẩn" value={data.rows.length} />
          <MetricCard label="Đã phân loại" value={accepted.length} />
          <MetricCard
            label="Đủ điều kiện GSC"
            value={data.rows.filter((row: any) => row.gsc_ready).length}
          />
          <MetricCard
            label="Đủ điều kiện KPI Nội dung"
            value={data.rows.filter((row: any) => row.content_kpi_eligible).length}
          />
          <MetricCard
            label="Đủ điều kiện KPI Hiệu suất"
            value={data.rows.filter((row: any) => row.performance_kpi_eligible).length}
          />
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Tháng
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Thành viên
            <select
              name="member"
              defaultValue={member}
              className="mt-1 block rounded-lg border px-3 py-2"
            >
              <option value="">Tất cả thành viên</option>
              {members.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 font-semibold">
            Lọc
          </button>
        </form>
        <DataTableContainer>
          <table className="min-w-[1700px] text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">URL</th>
                <th>Domain / Dự án</th>
                <th>Thành viên</th>
                <th>Công việc</th>
                <th>Phân loại</th>
                <th>Eligibility GSC</th>
                <th>Dữ liệu GSC thực tế</th>
                <th>KPI Nội dung</th>
                <th>KPI Hiệu suất</th>
                <th>Trạng thái nguồn</th>
                <th>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any) => (
                <tr
                  className="border-t"
                  key={`${row.id}-${row.work_event_id ?? "url"}`}
                >
                  <td
                    className="max-w-lg truncate p-3 text-blue-700"
                    title={row.url}
                  >
                    {row.url}
                  </td>
                  <td>
                    {row.normalized_domain} / {row.project}
                  </td>
                  <td>{row.member_name ?? "N/A"}</td>
                  <td>
                    {viLabel(row.work_type ?? row.content_type ?? "N/A")} /{" "}
                    {row.work_date ?? "N/A"}
                  </td>
                  <td>{viLabel(row.classification_status)}</td>
                  <td>{row.gsc_ready ? "Đủ điều kiện" : "Không đủ điều kiện"}</td>
                  <td>
                    {viLabel(row.gsc_data_status ?? "Chưa làm mới")}
                    {row.latest_gsc_metric_date
                      ? ` đến ${row.latest_gsc_metric_date}`
                      : ""}
                    {row.gsc_error ? ` - ${row.gsc_error}` : ""}
                  </td>
                  <td>{row.content_kpi_eligible ? "Đủ điều kiện" : "Không đủ điều kiện"}</td>
                  <td>
                    {row.performance_kpi_eligible ? "Đủ điều kiện" : "Không đủ điều kiện"}
                    {row.performance_readiness_issues?.length
                      ? ` · ${row.performance_readiness_issues.map(viReason).join(", ")}`
                      : ""}
                  </td>
                  <td>
                    {viLabel(row.event_source_state ?? row.unified_source_state ?? "active")}
                  </td>
                  <td>
                    {[
                      ...(row.classification_issues ?? []),
                      ...(row.readiness_issues ?? []),
                      ...(row.performance_readiness_issues ?? []),
                    ].map(viReason).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
        <section>
          <h3 className="mb-3 text-xl font-semibold">
            Các dòng cần xử lý gần nhất
          </h3>
          <DataTableContainer>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3">Dòng trên Sheet</th>
                  <th>Mục nguồn</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {data.quarantine.map((row: any) => (
                  <tr
                    className="border-t"
                    key={`${row.sync_run_id}-${row.source_row_number}`}
                  >
                    <td className="p-3">{row.source_row_number}</td>
                    <td>{row.source_item_id ?? "-"}</td>
                    <td>{row.quarantine_reasons.map(viReason).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableContainer>
        </section>
      </div>
    </Shell>
  );
}
