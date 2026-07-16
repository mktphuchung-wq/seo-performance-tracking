import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import { authOptions } from "../../../lib/auth";
import { listCanonicalDataSource } from "../../../lib/repositories/data-source";

export const dynamic = "force-dynamic";
const displayDate = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString() : "Never";

export default async function DataSourcePage(props: {
  searchParams?: Promise<{ month?: string; member?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
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
            Admin workflow 3/6
          </p>
          <h2 className="text-3xl font-bold">Canonical Data Source</h2>
          <p className="mt-2 text-slate-600">
            Classification readiness, actual GSC data, and KPI eligibility are
            separate states. Missing values remain N/A.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Source last committed"
            value={displayDate(source?.finished_at)}
          />
          <MetricCard
            label="GSC data through"
            value={gsc?.latest_complete_date ?? gsc?.data_cutoff ?? "N/A"}
          />
          <MetricCard
            label="Performance last calculated"
            value={displayDate(performance?.last_calculated)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Canonical URLs" value={data.rows.length} />
          <MetricCard label="Classified" value={accepted.length} />
          <MetricCard
            label="GSC eligible"
            value={data.rows.filter((row: any) => row.gsc_ready).length}
          />
          <MetricCard
            label="KPI-eligible events"
            value={data.rows.filter((row: any) => row.kpi_ready).length}
          />
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Month
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
              defaultValue={member}
              className="mt-1 block rounded-lg border px-3 py-2"
            >
              <option value="">All members</option>
              {members.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 font-semibold">
            Filter
          </button>
        </form>
        <DataTableContainer>
          <table className="min-w-[1700px] text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">URL</th>
                <th>Domain / Project</th>
                <th>Member</th>
                <th>Work</th>
                <th>Classification</th>
                <th>GSC eligibility</th>
                <th>Actual GSC data</th>
                <th>KPI state</th>
                <th>Source state</th>
                <th>Issues</th>
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
                    {row.work_type ?? row.content_type ?? "N/A"} /{" "}
                    {row.work_date ?? "N/A"}
                  </td>
                  <td>{row.classification_status}</td>
                  <td>{row.gsc_ready ? "Eligible" : "Not eligible"}</td>
                  <td>
                    {row.gsc_data_status ?? "Not refreshed"}
                    {row.latest_gsc_metric_date
                      ? ` through ${row.latest_gsc_metric_date}`
                      : ""}
                    {row.gsc_error ? ` - ${row.gsc_error}` : ""}
                  </td>
                  <td>{row.kpi_state}</td>
                  <td>
                    {row.event_source_state ??
                      row.unified_source_state ??
                      "active"}
                  </td>
                  <td>
                    {[
                      ...(row.classification_issues ?? []),
                      ...(row.readiness_issues ?? []),
                    ].join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
        <section>
          <h3 className="mb-3 text-xl font-semibold">
            Latest needs-attention rows
          </h3>
          <DataTableContainer>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3">Sheet row</th>
                  <th>Source item</th>
                  <th>Reasons</th>
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
                    <td>{row.quarantine_reasons.join(", ")}</td>
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
