import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PerformanceRefreshControl } from "../../../components/unified-workflows";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { getPerformanceWorkspace } from "../../../lib/services/performance-service";

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
  const all = await getPerformanceWorkspace({ asOfMonth: month });
  const members = all.summaries.map((row) => row.memberName);
  const selectedMember = members.includes(searchParams?.member ?? "")
    ? searchParams?.member
    : undefined;
  const data = selectedMember
    ? await getPerformanceWorkspace({
        asOfMonth: month,
        memberName: selectedMember,
      })
    : all;
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Admin workflow 4/6
          </p>
          <h2 className="text-3xl font-bold">Member Performance</h2>
          <p className="mt-2 text-slate-600">
            3M, 6M and All Time share one snapshot. Project rollup is automatic
            from eligible work units; no contribution setup is required.
          </p>
        </header>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            As-of month
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Member
            <select
              name="member"
              defaultValue={selectedMember}
              className="mt-1 block rounded-lg border px-3 py-2"
            >
              <option value="">All members</option>
              {members.map((member) => (
                <option key={member}>{member}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 font-semibold">
            View
          </button>
        </form>
        <PerformanceRefreshControl defaultMonth={month} />
        {data.summaries.map((member: any) => (
          <section className="space-y-4" key={member.memberName}>
            <h3 className="text-xl font-semibold">{member.memberName}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Member Performance"
                value={pct(member.memberResult.score)}
              />
              <MetricCard
                label="Coverage"
                value={pct(member.memberResult.coveragePct)}
              />
              <MetricCard label="Status" value={member.memberResult.status} />
            </div>
            <DataTableContainer>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="p-3">Project</th>
                    <th>Lifecycle</th>
                    <th>Eligible work units</th>
                    <th>3M</th>
                    <th>6M</th>
                    <th>All Time</th>
                    <th>Project score</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {member.projects.map((project: any) => (
                    <tr className="border-t" key={project.project}>
                      <td className="p-3">{project.project}</td>
                      <td>{project.lifecycle ?? "N/A"}</td>
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
                      <td>{pct(project.result.coveragePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableContainer>
          </section>
        ))}
        {!data.summaries.length && (
          <p className="rounded-xl border border-dashed p-6 text-slate-500">
            No Performance snapshot exists for the selected month/member.
          </p>
        )}
      </div>
    </Shell>
  );
}
