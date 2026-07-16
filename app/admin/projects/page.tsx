import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { DataTableContainer, Shell } from "../../../components/ui";
import { ProjectSettingsForm } from "../../../components/unified-workflows";
import { listUnifiedProjectSettings } from "../../../lib/repositories/project-settings";
import { listSearchConsoleProperties } from "../../../lib/google";
export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const data = await listUnifiedProjectSettings();
  const gscProperties = session.accessToken
    ? await listSearchConsoleProperties(session.accessToken).catch(() => [])
    : [];
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Admin workflow 2/6
          </p>
          <h2 className="text-3xl font-bold">Project Settings</h2>
          <p className="mt-2 text-slate-600">
            Select a synced project, confirm the detected domain and accessible
            GSC property, then approve lifecycle and 3M/6M/All Time settings.
          </p>
        </header>
        <ProjectSettingsForm
          options={data.options}
          gscProperties={gscProperties}
        />
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Project</th>
                <th>Domain</th>
                <th>Lifecycle</th>
                <th>GSC eligibility</th>
                <th>KPI eligibility</th>
                <th>3M / 6M / All</th>
                <th>Version</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((row: any) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">{row.canonical_name}</td>
                  <td>{row.canonical_domain ?? "Not configured"}</td>
                  <td>{row.lifecycle ?? "Not configured"}</td>
                  <td>{row.gsc_ready ? "Ready" : "Not ready"}</td>
                  <td>{row.kpi_ready ? "Ready" : "Not ready"}</td>
                  <td>
                    {row.performance_weight_3m_pct ?? "—"} /{" "}
                    {row.performance_weight_6m_pct ?? "—"} /{" "}
                    {row.performance_weight_all_time_pct ?? "—"}
                  </td>
                  <td>{row.version ?? "—"}</td>
                  <td>{row.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
