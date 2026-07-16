import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../lib/auth";
import { getDbContentUrls } from "../../../../lib/postgres";
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json({ error: "Bạn chưa đăng nhập hoặc không có quyền quản trị." }, { status: 401 });
  const rows = await getDbContentUrls();
  const projects = Object.values(
    rows.reduce<
      Record<string, { project: string; urls: number; gscProperty?: string }>
    >((acc, row) => {
      acc[row.project] ??= {
        project: row.project,
        urls: 0,
        gscProperty: row.gscProperty,
      };
      acc[row.project].urls += 1;
      return acc;
    }, {}),
  );
  return NextResponse.json({ projects });
}
