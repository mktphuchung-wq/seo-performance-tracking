import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { getComparedPerformance } from "../../../lib/cache";
import { getDateRange } from "../../../lib/dates";
import { getContentUrls } from "../../../lib/google";
import { DateRangePicker, RefreshDataButton, Shell, UrlTable, WarningList, type UrlSortKey } from "../../../components/ui";

export default async function AdminUrls({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: UrlSortKey } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.accessToken) redirect("/");
  if (!session.user.isAdmin) redirect("/dashboard");
  const rangeKey = searchParams?.range || "28d";
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const cached = await getComparedPerformance(await getContentUrls(session.accessToken), session.accessToken, rangeKey, range);
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">All tracked URLs</h2><p className="text-sm text-slate-500">Sorting preserves the selected date range and filters.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{cached.cacheUsed ? "Using fresh cache" : "Refreshed"}{cached.lastUpdated ? ` · ${cached.lastUpdated}` : ""}</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/admin/urls" preserve={searchParams} /></div></div>
    <DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} preserve={searchParams} />
    <WarningList warnings={[cached.warning, ...cached.rows.map((p) => p.warning)]} />
    <UrlTable rows={cached.rows} sort={searchParams?.sort || "clicks"} basePath="/admin/urls" preserve={searchParams} />
  </Shell>;
}
