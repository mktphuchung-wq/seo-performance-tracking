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
    ? "Chưa có dữ liệu"
    : `${Number(value).toFixed(1)}%`;

const criterionLabels: Record<string, string> = {
  intent_audience_pain: "Ý định tìm kiếm, chân dung và vấn đề người đọc",
  outline_structure: "Dàn ý, phân cấp và cấu trúc",
  usefulness_semantics: "Tính hữu ích, đầy đủ và bao phủ ngữ nghĩa",
  accuracy_eeat: "Độ chính xác, E-E-A-T và nguồn đáng tin cậy",
  metadata_onpage: "Metadata và tối ưu on-page/entity",
  links: "Liên kết nội bộ và bên ngoài",
  ux_media_accessibility: "UX, khả năng đọc, media và tiếp cận",
  diagnosis: "Chẩn đoán, bằng chứng và ưu tiên",
  intent_semantic_gap: "Điều chỉnh ý định và khoảng trống ngữ nghĩa",
  accuracy_freshness_eeat: "Độ chính xác, độ mới và E-E-A-T",
  structure_ux: "Cấu trúc, UX và khả năng đọc",
  media_accessibility: "Media và khả năng tiếp cận",
  implementation_qa: "Mức độ hoàn tất triển khai và QA",
};

type SavedCriterion = {
  criterionKey: string;
  score: number | null;
  isNa?: boolean;
  naReason?: string | null;
  note?: string | null;
};

export default async function MemberReview(props: {
  searchParams?: Promise<{ month?: string; member?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");

  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const memberOptions = await listMemberOptions(month, "review");
  const members = memberOptions.map((row) => row.memberName);
  const selectedMember = members.includes(searchParams?.member ?? "")
    ? searchParams?.member
    : members[0];
  const audit = await listMonthlyKpiAudit(month, selectedMember);
  const reviews = audit.reviews;
  const seoContent = audit.components.find(
    (row: any) => row.component_key === "seo_content",
  );
  const projectCount = new Set(reviews.map((row: any) => row.project)).size;
  const diagnostics = audit.reviewDiagnostics as Record<string, number>;

  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 5/6
          </p>
          <h2 className="text-3xl font-bold">Đánh giá thành viên — {month}</h2>
          <p className="mt-2 text-slate-600">
            Chọn tháng và thành viên để đánh giá từng URL chuẩn. Điểm chất lượng
            và độ phủ được tính theo đơn vị công việc, không theo số dòng.
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
            Tải hàng đợi
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
          <MetricCard label="URL đủ điều kiện" value={reviews.length} />
          <MetricCard label="Số dự án" value={projectCount} />
          <MetricCard label="Điểm SEO Content" value={pct(seoContent?.payable_pct)} />
          <MetricCard label="Độ phủ đánh giá" value={pct(seoContent?.coverage_pct)} />
        </div>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold">
            {selectedMember
              ? `Hàng đợi đánh giá URL của ${selectedMember}`
              : "Hàng đợi đánh giá URL"}
          </h3>
          {reviews.map((row: any) => {
            const rubric = rubricForWorkType(row.work_type);
            const saved = (row.saved_criteria ?? []) as SavedCriterion[];
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
                    {viLabel(row.review_status ?? "review_pending")}
                    {row.quality_pct !== null && row.quality_pct !== undefined
                      ? ` · ${Number(row.quality_pct).toFixed(1)}%`
                      : ""}
                  </span>
                </div>
                {rubric && (
                  <QualityReviewEditor
                    month={month}
                    workEventId={row.work_event_id}
                    initialAdminNote={row.admin_note}
                    criteria={rubric.criteria.map((criterion) => {
                      const prior = saved.find(
                        (item) => item.criterionKey === criterion.key,
                      );
                      return {
                        criterionKey: criterion.key,
                        label: `${criterionLabels[criterion.key] ?? criterion.name} (${criterion.weightPct}%)`,
                        allowsNa: criterion.allowsNa,
                        initialScore: prior?.score,
                        initialIsNa: prior?.isNa,
                        initialNaReason: prior?.naReason,
                        initialNote: prior?.note,
                      };
                    })}
                  />
                )}
              </article>
            );
          })}

          {!reviews.length && (
            <div className="rounded-xl border border-dashed p-6 text-slate-600">
              {Number(diagnostics.source_rows ?? 0) > 0 ? (
                <>
                  <p className="font-semibold">Có dữ liệu nguồn nhưng chưa có URL đủ điều kiện đánh giá.</p>
                  <p className="mt-1 text-sm">
                    Nguồn: {diagnostics.source_rows ?? 0} dòng · Event hoạt động:{" "}
                    {diagnostics.active_events ?? 0} · Event đủ điều kiện:{" "}
                    {diagnostics.eligible_events ?? 0}. Kiểm tra trạng thái phân loại
                    tại trang Nguồn dữ liệu.
                  </p>
                </>
              ) : (
                <p>Chưa có event trong tháng: chưa có dòng nguồn cho thành viên đã chọn.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
