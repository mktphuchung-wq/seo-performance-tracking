import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { MetricCard, Shell } from "../../../components/ui";
import {
  QualityReviewEditor,
  TargetForm,
} from "../../../components/unified-workflows";
import { listMonthlyKpiAudit } from "../../../lib/repositories/monthly-kpi";
import { rubricForWorkType } from "../../../lib/kpi/rubrics";
import { listMemberOptions } from "../../../lib/repositories/member-options";
import { viLabel } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";
const pct = (value: unknown) =>
  value === null || value === undefined
    ? "N/A"
    : `${Number(value).toFixed(1)}%`;

export default async function MemberReview(props: {
  searchParams?: Promise<{ month?: string; member?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const [audit, memberOptions] = await Promise.all([
    listMonthlyKpiAudit(month),
    listMemberOptions(month, "review"),
  ]);
  const members = memberOptions.map((row) => row.memberName);
  const selectedMember = members.includes(searchParams?.member ?? "")
    ? searchParams?.member
    : members[0];
  const reviews = audit.reviews.filter(
    (row: any) => row.member_name === selectedMember,
  );
  const components = audit.components.filter(
    (row: any) => row.member_name === selectedMember,
  );
  const seoContent = components.find(
    (row: any) => row.component_key === "seo_content",
  );
  const projectCount = new Set(reviews.map((row: any) => row.project)).size;
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 5/6
          </p>
          <h2 className="text-3xl font-bold">Đánh giá thành viên — {month}</h2>
          <p className="mt-2 text-slate-600">
            Tháng → Thành viên → từng URL chuẩn đã thực hiện. Target thuộc Thành
            viên × Tháng; dự án được xác định từ từng event công việc.
          </p>
        </header>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm">
            Tháng
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 block rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Thành viên
            <select
              name="member"
              defaultValue={selectedMember}
              className="mt-1 block rounded-lg border px-3 py-2"
            >
              {members.map((member) => (
                <option key={member}>{member}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 font-semibold">
            Tải nhóm event
          </button>
        </form>
        {members.length > 0 && (
          <TargetForm
            month={month}
            members={members}
            selectedMember={selectedMember}
          />
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="URL trong tháng" value={reviews.length} />
          <MetricCard label="Số dự án" value={projectCount} />
          <MetricCard
            label="SEO Content"
            value={pct(seoContent?.payable_pct)}
          />
          <MetricCard
            label="Độ phủ đánh giá"
            value={pct(seoContent?.coverage_pct)}
          />
        </div>
        <section className="space-y-4">
          <h3 className="text-xl font-semibold">
            {selectedMember
              ? `Hàng đợi đánh giá URL của ${selectedMember}`
              : "Hàng đợi đánh giá URL"}
          </h3>
          {reviews.map((row: any) => {
            const rubric = rubricForWorkType(row.work_type);
            return (
              <article
                className="rounded-2xl border bg-white p-5 shadow-sm"
                key={row.work_event_id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <a
                      className="font-semibold text-blue-700"
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.url}
                    </a>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.project} · {viLabel(row.work_type)} · {row.work_date} ·{" "}
                      {Number(row.unit_value).toFixed(2)} đơn vị
                    </p>
                  </div>
                  <span>
                    {viLabel(row.review_status ?? "pending")}{" "}
                    {row.quality_pct !== null && row.quality_pct !== undefined
                      ? `· ${Number(row.quality_pct).toFixed(1)}%`
                      : ""}
                  </span>
                </div>
                {rubric && (
                  <QualityReviewEditor
                    month={month}
                    workEventId={row.work_event_id}
                    criteria={rubric.criteria.map((criterion) => ({
                      criterionKey: criterion.key,
                      label: `${criterion.name} (${criterion.weightPct}%)`,
                      allowsNa: criterion.allowsNa,
                    }))}
                  />
                )}
              </article>
            );
          })}
          {!reviews.length && (
            <p className="rounded-xl border border-dashed p-6 text-slate-500">
              Chưa có event trong tháng.
            </p>
          )}
        </section>
      </div>
    </Shell>
  );
}
