import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../lib/auth";
import { Shell } from "../components/ui";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) redirect("/dashboard");
  return <Shell><div className="rounded-xl border bg-white p-8"><h2 className="text-xl font-semibold">Đăng nhập bằng Google</h2><p className="mt-2 text-slate-600">Phiên đăng nhập xác định vai trò Quản trị viên hoặc danh tính Thành viên chuẩn. Các trang thành viên không nhận danh tính khác từ trình duyệt.</p><Link className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/api/auth/signin">Tiếp tục</Link></div></Shell>;
}
