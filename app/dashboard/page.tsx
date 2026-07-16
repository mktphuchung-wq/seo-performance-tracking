import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../components/ui";
import { resolveMemberNameByEmail } from "../../lib/member-identity";
import { getPerformanceWorkspace } from "../../lib/services/performance-service";
export const dynamic = "force-dynamic";
const pct = (v: any) =>
  v === null || v === undefined ? "N/A" : `${Number(v).toFixed(1)}%`;
export default async function MyPerformance(props: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/");
  if (session.user.isAdmin) redirect("/admin/sync");
  const memberName = await resolveMemberNameByEmail(session.user.email);
  if (!memberName) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const data = await getPerformanceWorkspace({ asOfMonth: month, memberName });
  const summary = data.summaries[0];
  return (
    <Shell email={session.user.email}>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Không gian thành viên
          </p>
          <h2 className="text-3xl font-bold">Hiệu suất của tôi</h2>
          <p className="mt-2 text-slate-600">
            Mặc định xem 3 tháng, kèm ngữ cảnh 6 tháng và toàn thời gian. Điểm
            luôn hiển thị độ phủ, độ tin cậy và tổng hợp event đủ điều kiện.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Hiệu suất thành viên"
            value={pct(summary?.memberResult.score)}
          />
          <MetricCard
            label="Độ phủ"
            value={pct(summary?.memberResult.coveragePct)}
          />
          <MetricCard
            label="Trạng thái"
            value={summary?.memberResult.status ?? "N/A"}
          />
        </div>
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Dự án</th>
                <th>3M</th>
                <th>6M</th>
                <th>Toàn thời gian</th>
                <th>Điểm dự án</th>
                <th>Độ phủ</th>
                <th>Vòng đời</th>
              </tr>
            </thead>
            <tbody>
              {summary?.projects.map((project: any) => (
                <tr className="border-t" key={project.project}>
                  <td className="p-3">{project.project}</td>
                  {["3m", "6m", "all_time"].map((key) => (
                    <td key={key}>
                      {pct(
                        project.ranges.find((r: any) => r.range_key === key)
                          ?.payable_pct,
                      )}
                    </td>
                  ))}
                  <td>{pct(project.result.score)}</td>
                  <td>{pct(project.result.coveragePct)}</td>
                  <td>{project.lifecycle ?? "—"}</td>
                </tr>
              ))}
              {!summary && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={7}>
                    Chưa có kết quả Hiệu suất chuẩn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
