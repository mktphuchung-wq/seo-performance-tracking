import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../lib/auth";
import { Shell } from "../components/ui";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) redirect("/dashboard");
  return <Shell><div className="rounded-xl border bg-white p-8"><h2 className="text-xl font-semibold">Sign in with Google</h2><p className="mt-2 text-slate-600">Access is limited by MEMBER_EMAIL_MAP. Admins are configured with ADMIN_EMAILS.</p><a className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/api/auth/signin">Continue</a></div></Shell>;
}
