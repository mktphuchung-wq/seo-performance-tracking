import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SourcePipelineControls } from "../../../components/unified-workflows";
import { SchemaMigrationRequired } from "../../../components/schema-migration-required";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { checkDbSchemaHealth } from "../../../lib/db-health";
import { listCanonicalDataSource } from "../../../lib/repositories/data-source";
import { formatViDateTime, viLabel } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";
export default async function SyncPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const schema = await checkDbSchemaHealth();
  if (!schema.ok)
    return (
      <Shell email={session.user.email} isAdmin>
        <SchemaMigrationRequired schema={schema} />
      </Shell>
    );
  const data = await listCanonicalDataSource({ limit: 1 });
  const latest = data.runs[0];
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 1/6
          </p>
          <h2 className="text-3xl font-bold">Đồng bộ dữ liệu</h2>
          <p className="mt-2 text-slate-600">
            Database Performance SEO / content_urls chỉ đọc. Bản xem trước kiểm
            tra Dự án, URL, Thành viên, Ngày và Loại trước khi ghi idempotent đã duyệt.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Dòng nguồn"
            value={latest?.raw_row_count ?? "N/A"}
          />
          <MetricCard
            label="Event hợp lệ"
            value={latest?.logical_item_count ?? "N/A"}
          />
          <MetricCard
            label="Ứng viên đã chấp nhận"
            value={latest?.accepted_row_count ?? "N/A"}
          />
          <MetricCard
            label="Cần xử lý"
            value={latest?.quarantined_count ?? "N/A"}
          />
        </div>
        <SourcePipelineControls />
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Lần chạy</th>
                <th>Giai đoạn</th>
                <th>Trạng thái</th>
                <th>Dòng nguồn</th>
                <th>Ứng viên đã chấp nhận</th>
                <th>Cần xử lý</th>
                <th>Người duyệt</th>
                <th>Hoàn tất</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((row: any) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3 font-mono">{row.id}</td>
                  <td>{viLabel(row.workflow_stage)}</td>
                  <td>{viLabel(row.status)}</td>
                  <td>{row.raw_row_count}</td>
                  <td>{row.accepted_row_count}</td>
                  <td>{row.quarantined_count}</td>
                  <td>{row.reviewed_by ?? "-"}</td>
                  <td>
                    {row.finished_at
                      ? formatViDateTime(row.finished_at)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
