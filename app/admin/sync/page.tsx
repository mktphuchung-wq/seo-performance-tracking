import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SourcePipelineControls } from "../../../components/unified-workflows";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { listCanonicalDataSource } from "../../../lib/repositories/data-source";

export const dynamic = "force-dynamic";
export default async function SyncPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const data = await listCanonicalDataSource({ limit: 1 });
  const latest = data.runs[0];
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Admin workflow 1/6
          </p>
          <h2 className="text-3xl font-bold">Data Sync</h2>
          <p className="mt-2 text-slate-600">
            Performance SEO database / content_urls is read-only. Preview
            validates Project, URL, Member name, Date and Type before an
            approved idempotent commit.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Source rows"
            value={latest?.raw_row_count ?? "N/A"}
          />
          <MetricCard
            label="Valid work records"
            value={latest?.logical_item_count ?? "N/A"}
          />
          <MetricCard
            label="Accepted candidates"
            value={latest?.accepted_row_count ?? "N/A"}
          />
          <MetricCard
            label="Needs attention"
            value={latest?.quarantined_count ?? "N/A"}
          />
        </div>
        <SourcePipelineControls />
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Run</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Source rows</th>
                <th>Accepted candidates</th>
                <th>Needs attention</th>
                <th>Reviewer</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((row: any) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3 font-mono">{row.id}</td>
                  <td>{row.workflow_stage}</td>
                  <td>{row.status}</td>
                  <td>{row.raw_row_count}</td>
                  <td>{row.accepted_row_count}</td>
                  <td>{row.quarantined_count}</td>
                  <td>{row.reviewed_by ?? "-"}</td>
                  <td>
                    {row.finished_at
                      ? new Date(row.finished_at).toLocaleString()
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
