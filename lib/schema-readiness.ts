import { checkDbSchemaHealth, type DbSchemaHealth } from "./db-health";

export class SchemaMigrationRequiredError extends Error {
  readonly code = "schema_migration_required";
  readonly status = 503;
  readonly details: {
    missingTables: string[];
    missingColumns: string[];
    migrationWarnings: string[];
  };

  constructor(schema: DbSchemaHealth) {
    super(
      "The database schema is older than this application deployment. Apply the unified migration chain before using Monthly KPI v2.",
    );
    this.name = "SchemaMigrationRequiredError";
    this.details = {
      missingTables: schema.missingTables,
      missingColumns: schema.missingColumns,
      migrationWarnings: schema.migrationWarnings,
    };
  }
}

export async function assertUnifiedSchemaReady() {
  const schema = await checkDbSchemaHealth();
  if (!schema.ok) throw new SchemaMigrationRequiredError(schema);
  return schema;
}
