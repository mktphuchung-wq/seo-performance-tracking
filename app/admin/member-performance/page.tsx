import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PerformanceRefreshControl } from "../../../components/unified-workflows";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { getPerformanceWorkspace } from "../../../lib/services/performance-service";
import { listMemberOptions } from "../../../lib/repositories/member-options";
import { viLabel, viReason } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";
const pct = (value: unknown) =>
  value === null || value === undefined
    ? "N/A"
    : `${Number(value).toFixed(1)}%`;

export default async function MemberPerformance(props: {
  searchParams?: Promise<{ month?: string; member?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const memberOptions = await listMemberOptions(month, "performance");
  const members = memberOptions.map((row) => row.memberName);
  const selectedMember = members.includes(searchParams?.member ?? "")
    ? searchParams?.member
    : members[0];
  const data = selectedMember
    ? await getPerformanceWorkspace({ asOfMonth: month, memberName: selectedMember })
    : { asOfMonth: month, summaries: [] };
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 4/6
          </p>
          <h2 className="text-3xl font-bold">Hiệu suất thành viên</h2>
          <p className="mt-2 text-slate-600">
            Các kỳ 3 tháng, 6 tháng và toàn thời gian dùng chung một snapshot.
            Điểm dự án được tổng hợp tự động từ các event đủ điều kiện.
          </p>
        </header>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Tháng chốt dữ liệu
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
              defaultValue={selectedMember}
              className="mt-1 block rounded-lg border px-3 py-2"
            >
              {members.map((member) => (
                <option key={member}>{member}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 font-semibold">
            Xem
          </button>
        </form>
        <PerformanceRefreshControl defaultMonth={month} />
        {data.summaries.map((member: any) => (
          <section className="space-y-4" key={member.memberName}>
            <h3 className="text-xl font-semibold">{member.memberName}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Hiệu suất thành viên"
                value={pct(member.memberResult.score)}
              />
              <MetricCard
                label="Độ phủ"
                value={pct(member.memberResult.coveragePct)}
              />
              <MetricCard label="Trạng thái" value={viLabel(member.memberResult.status)} />
            </div>
            <DataTableContainer>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="p-3">Project</th>
                    <th>Vòng đời</th>
                    <th>Event đủ điều kiện</th>
                    <th>3M</th>
                    <th>6M</th>
                    <th>Toàn thời gian</th>
                    <th>Điểm dự án</th>
                    <th>Cửa sổ hiệu lực</th>
                    <th>Độ tin cậy</th>
                    <th>Độ phủ</th>
                    <th>Lý do fallback</th>
                  </tr>
                </thead>
                <tbody>
                  {member.projects.map((project: any) => (
                    <tr className="border-t" key={project.project}>
                      <td className="p-3">{project.project}</td>
                      <td>{viLabel(project.lifecycle ?? "N/A")}</td>
                      <td>{project.workUnits}</td>
                      {["3m", "6m", "all_time"].map((key) => (
                        <td key={key}>
                          {pct(
                            project.ranges.find(
                              (row: any) => row.range_key === key,
                            )?.payable_pct,
                          )}
                        </td>
                      ))}
                      <td>{pct(project.result.score)}</td>
                      <td>{viLabel(project.result.effectiveHorizon ?? project.effectiveHorizon ?? "N/A")}</td>
                      <td>{viLabel(project.result.confidence ?? "N/A")}</td>
                      <td>{pct(project.result.coveragePct)}</td>
                      <td>{viReason(project.result.fallbackReason ?? project.fallbackReason ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>
          </section>
        ))}
        {!data.summaries.length && (
          <p className="rounded-xl border border-dashed p-6 text-slate-500">
            Chưa có event trong tháng.
          </p>
        )}
      </div>
    </Shell>
  );
}
