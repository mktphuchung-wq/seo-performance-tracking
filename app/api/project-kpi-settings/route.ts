import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../lib/auth";
import { getProjectKpiSettings, parseProjectKpiForm, upsertProjectKpiSettings } from "../../../lib/project-kpi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getProjectKpiSettings() });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const input = contentType.includes("application/json") ? await request.json() : parseProjectKpiForm(await request.formData());
  const saved = await upsertProjectKpiSettings(input);
  if (contentType.includes("application/json")) return NextResponse.json({ setting: saved });
  return NextResponse.redirect(new URL("/admin/project-kpi-settings", request.url));
}
