import { NextResponse } from "next/server";
import { checkDbSchemaHealth } from "../../../../lib/db-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schema = await checkDbSchemaHealth();
    return NextResponse.json({ ok: schema.ok, schema, projectKpiSettings: schema.projectKpiSettings }, { status: schema.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: "Database health check failed", details: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
