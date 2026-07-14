import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../lib/auth";
import { getDateRange, normalizeDateRangeKey } from "../../lib/dates";
import { filterRowsForEmail } from "../../lib/google";
import { getDbPerformance } from "../../lib/postgres";
import { DateRangePicker, RefreshDataButton, Shell, UrlTable, WarningList, type UrlSortDirection, type UrlSortKey } from "../../components/ui";

export default async function AdminUrls({ searchParams }: { searchParams?: { range?: string; startDate?: string; endDate?: string; sort?: UrlSortKey; direction?: UrlSortDirection } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email ) redirect("/");
  const rangeKey = normalizeDateRangeKey(searchParams?.range);
  const range = getDateRange({ range: rangeKey, startDate: searchParams?.startDate, endDate: searchParams?.endDate });
  const allRows = await getDbPerformance(rangeKey, range);
  const rows = session.user.isAdmin ? allRows : filterRowsForEmail(allRows, session.user.email, false);
  return <Shell email={session.user.email} isAdmin={session.user.isAdmin}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Nguồn dữ liệu URL</h2><p className="text-sm text-slate-500">Thao tác sắp xếp vẫn giữ nguyên khoảng ngày và bộ lọc đã chọn.</p><p className="mt-1 text-sm text-slate-600">Ngày thực hiện là ngày xuất bản đối với nội dung mới, hoặc ngày audit/cập nhật đối với URL audit.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Bộ nhớ đệm Performance</span><RefreshDataButton range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} returnTo="/url-data-source" preserve={searchParams} /></div></div>
    <DateRangePicker range={rangeKey} startDate={searchParams?.startDate} endDate={searchParams?.endDate} preserve={searchParams} />
    <WarningList warnings={[...rows.map((p) => p.warning)]} />
    <UrlTable rows={rows} sort={searchParams?.sort || "clicks"} basePath="/url-data-source" preserve={searchParams} />
  </Shell>;
}
