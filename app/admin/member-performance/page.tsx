import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { PerformanceRefreshControl } from "../../../components/unified-workflows";
import { MemberPerformanceSelector } from "../../../components/member-performance-selector";
import { getPerformanceWorkspace } from "../../../lib/services/performance-service";
import { listMemberOptions } from "../../../lib/repositories/member-options";
import { viLabel, viReason } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";
const pct = (value: unknown) =>
  value === null || value === undefined ? "Chưa có" : `${Number(value).toFixed(1)}%`;

export default async function MemberPerformance(props: {
  searchParams?: Promise<{ month?: string; member?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const memberOptions = await listMemberOptions(month, "performance");
  const available = memberOptions.map((row) => row.memberName);
  const requested = Array.isArray(searchParams?.member)
    ? searchParams.member
    : searchParams?.member
      ? [searchParams.member]
      : [];
  const selectedMembers = requested.filter((name) => available.includes(name));
  if (!selectedMembers.length && available[0]) selectedMembers.push(available[0]);
  const data = selectedMembers.length
    ? await getPerformanceWorkspace({ asOfMonth: month, memberNames: selectedMembers })
    : { asOfMonth: month, summaries: [] };
  const comparison = selectedMembers.length > 1;
  const totalEvents = memberOptions
    .filter((row) => selectedMembers.includes(row.memberName))
    .reduce((sum, row) => sum + row.eventCount, 0);
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">Quy trình quản trị 4/6</p>
          <h2 className="text-3xl font-bold">Hiệu suất thành viên</h2>
          <p className="mt-2 text-slate-600">
            Một thành viên hiển thị chi tiết; từ hai thành viên hiển thị so sánh; chọn tất cả để xem tổng quan team.
            Thành viên có Content event vẫn xuất hiện kể cả khi chưa refresh GSC.
          </p>
        </header>
        <form method="get" className="flex items-end gap-3">
          <label className="text-sm">Tháng chốt dữ liệu<input name="month" type="month" defaultValue={month} className="mt-1 block rounded-lg border px-3 py-2" /></label>
          {selectedMembers.map((member) => <input key={member} type="hidden" name="member" value={member} />)}
          <button className="rounded-lg border px-4 py-2 font-semibold">Đổi tháng</button>
        </form>
        <MemberPerformanceSelector month={month} members={memberOptions} selected={selectedMembers} />
        <PerformanceRefreshControl defaultMonth={month} />
        {comparison && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Thành viên đã chọn" value={selectedMembers.length} />
              <MetricCard label="Content event tháng" value={totalEvents} />
              <MetricCard label="Có kết quả Performance" value={data.summaries.filter((row: any) => row.memberResult.score !== null).length} />
            </div>
            <DataTableContainer>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left"><tr><th className="p-3">Thành viên</th><th>Event</th><th>Dự án</th><th>Điểm</th><th>Độ phủ</th><th>Trạng thái</th><th>Lý do / bước tiếp theo</th></tr></thead>
                <tbody>{data.summaries.map((member: any) => {
                  const option = memberOptions.find((row) => row.memberName === member.memberName);
                  return <tr className="border-t" key={member.memberName}><td className="p-3 font-semibold">{member.memberName}</td><td>{option?.eventCount ?? 0}</td><td>{member.projects.length}</td><td>{pct(member.memberResult.score)}</td><td>{pct(member.memberResult.coveragePct)}</td><td>{viLabel(member.memberResult.status)}</td><td>{viReason(member.memberResult.reason ?? ((option?.eventCount ?? 0) > 0 ? "performance_not_refreshed" : "no_event"))}</td></tr>;
                })}</tbody>
              </table>
            </DataTableContainer>
          </>
        )}
        {!comparison && data.summaries.map((member: any) => (
          <section className="space-y-4" key={member.memberName}>
            <h3 className="text-xl font-semibold">{member.memberName}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Hiệu suất thành viên" value={pct(member.memberResult.score)} />
              <MetricCard label="Độ phủ" value={pct(member.memberResult.coveragePct)} />
              <MetricCard label="Trạng thái" value={viLabel(member.memberResult.status)} />
            </div>
            <DataTableContainer>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left"><tr><th className="p-3">Project</th><th>Vòng đời</th><th>Event units</th><th>3T</th><th>6T</th><th>Toàn thời gian</th><th>Điểm dự án</th><th>Cửa sổ hiệu lực</th><th>Độ tin cậy</th><th>Độ phủ</th><th>Lý do</th></tr></thead>
                <tbody>{member.projects.map((project: any) => (
                  <tr className="border-t" key={project.project}>
                    <td className="p-3">{project.project}</td><td>{viLabel(project.lifecycle ?? "Chưa cấu hình")}</td><td>{project.workUnits}</td>
                    {(["3m", "6m", "all_time"] as const).map((key) => <td key={key}>{pct(project.ranges.find((row: any) => row.range_key === key)?.payable_pct)}</td>)}
                    <td>{pct(project.result.score)}</td><td>{viLabel(project.result.effectiveHorizon ?? "Chưa tính")}</td><td>{viLabel(project.result.confidence ?? "unknown")}</td><td>{pct(project.result.coveragePct)}</td><td>{viReason(project.result.fallbackReason ?? project.result.reason ?? "performance_not_refreshed")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </DataTableContainer>
          </section>
        ))}
        {!data.summaries.length && <p className="rounded-xl border border-dashed p-6 text-slate-500">Chưa có event trong tháng: không tìm thấy Content event hợp lệ.</p>}
      </div>
    </Shell>
  );
}
