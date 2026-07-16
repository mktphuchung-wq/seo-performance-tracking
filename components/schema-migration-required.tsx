import type { DbSchemaHealth } from "../lib/db-health";

export function SchemaMigrationRequired({
  schema,
}: {
  schema: DbSchemaHealth;
}) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide">
        Database setup required
      </p>
      <h2 className="mt-2 text-2xl font-bold">
        Monthly KPI v2 schema has not been applied
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6">
        This deployment is newer than its database. The page has been stopped
        before executing incompatible SQL, so it will no longer fail with a raw
        missing-column error.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase text-amber-800">
            Missing tables
          </div>
          <div className="mt-1 text-2xl font-bold">
            {schema.missingTables.length}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase text-amber-800">
            Missing columns
          </div>
          <div className="mt-1 text-2xl font-bold">
            {schema.missingColumns.length}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm">
        Apply the migration chain with <code>npm run db:migrate:unified</code>{" "}
        against an isolated Preview database first. Verify the health endpoint,
        then explicitly approve the same migration for production.
      </p>
      {schema.migrationWarnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {schema.migrationWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
