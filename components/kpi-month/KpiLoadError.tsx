export function KpiLoadError({ requestId, message }: { requestId: string; message: string }) {
  const schema = /relation|column|schema|does not exist/i.test(message);
  const config = /DATABASE_URL|configured|environment/i.test(message);
  return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
    <h2 className="text-xl font-bold">Monthly KPI data could not be loaded</h2>
    <p className="mt-2 text-sm">{schema ? "The staging database is missing a required KPI migration." : config ? "The deployment configuration is incomplete." : "The database query failed; this is not an empty-data state."}</p>
    <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
      {schema && <li>Apply migrations through <code>20260714_monthly_kpi_v2_completion.sql</code> to the dedicated staging branch.</li>}
      <li>Confirm the preview deployment points to the staging database and <code>KPI_ENGINE_V2_ENABLED=true</code> only there.</li>
      <li>Retry, then give request ID <code>{requestId}</code> to the technical owner if it still fails.</li>
    </ol>
  </section>;
}
