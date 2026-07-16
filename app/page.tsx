import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../lib/auth";
import { Shell } from "../components/ui";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) redirect("/dashboard");
  return <Shell><div className="rounded-xl border bg-white p-8"><h2 className="text-xl font-semibold">Sign in with Google</h2><p className="mt-2 text-slate-600">Your session resolves an Admin role or a canonical Member identity. Member routes never accept another member identity from the browser.</p><Link className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/api/auth/signin">Continue</Link></div></Shell>;
}
