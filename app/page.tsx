import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../lib/auth";
import { Shell } from "../components/ui";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) redirect("/dashboard");
  return <Shell><div className="rounded-xl border bg-white p-8"><h2 className="text-xl font-semibold">Đăng nhập bằng Google</h2><p className="mt-2 text-slate-600">Quyền truy cập được giới hạn theo <code>MEMBER_EMAIL_MAP</code>. Quản trị viên được cấu hình bằng <code>ADMIN_EMAILS</code>.</p><a className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/api/auth/signin">Tiếp tục</a></div></Shell>;
}
