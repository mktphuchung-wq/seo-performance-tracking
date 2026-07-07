import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getAllMemberPerformanceFinal, getMemberPerformanceFinalByMember } from "../../../../lib/postgres";
import { adjustMemberFinal, defaultProjectKpiSettings } from "../../../../lib/project-kpi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = session.user.isAdmin ? await getAllMemberPerformanceFinal() : await getMemberPerformanceFinalByMember(session.user.email).then((r) => r ? [r] : []);
  return NextResponse.json({ members: rows.map((row) => adjustMemberFinal(row, defaultProjectKpiSettings("default"))) });
}
