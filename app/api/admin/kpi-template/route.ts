import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { listKpiTemplates } from "../../../../lib/repositories/kpi-template";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    templates: await listKpiTemplates(),
    deprecated: true,
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Global KPI Template writes are retired. Configure weights per Member x Month at /api/admin/kpi-close/config.",
    },
    { status: 410 },
  );
}
