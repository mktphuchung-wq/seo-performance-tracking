import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { aggregate, filterRowsForEmail, getContentUrls, getUrlPerformance } from "../../../lib/google";
import { MetricGrid, Shell, UrlTable } from "../../../components/ui";

export default async function MemberDashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  const allRows = await getContentUrls(session.accessToken);
  const rows = filterRowsForEmail(allRows, session.user.email, session.user.isAdmin);
  const performance = await getUrlPerformance(rows, session.accessToken);
  return <Shell><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-semibold">Member dashboard</h2>{session.user.isAdmin && <a href="/dashboard/admin">Admin dashboard</a>}</div><MetricGrid metrics={aggregate(performance)} count={performance.length} /><h3 className="mb-3 mt-8 text-xl font-semibold">Your URLs</h3><UrlTable rows={performance} /></Shell>;
}
