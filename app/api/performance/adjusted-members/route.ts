import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getAllMemberPerformanceFinal, getAllMemberProjectPerformanceFinal, getMemberPerformanceFinalByMember, getMemberProjectPerformanceFinalByMember } from "../../../../lib/postgres";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, memberProjects] = session.user.isAdmin
    ? await Promise.all([getAllMemberPerformanceFinal(), getAllMemberProjectPerformanceFinal()])
    : await Promise.all([
      getMemberPerformanceFinalByMember(session.user.email).then((row) => row ? [row] : []),
      getMemberProjectPerformanceFinalByMember(session.user.email),
    ]);
  return NextResponse.json({ members: rows, memberProjects });
}
