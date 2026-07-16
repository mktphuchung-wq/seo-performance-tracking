import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { DataTableContainer, MetricCard, Shell } from "../../../components/ui";
import {
  KpiCloseControls,
  MemberKpiConfigForm,
} from "../../../components/unified-workflows";
import { authOptions } from "../../../lib/auth";
import { listMonthlyKpiAudit } from "../../../lib/repositories/monthly-kpi";
import { listMemberOptions } from "../../../lib/repositories/member-options";
import { formatViDateTime, viLabel } from "../../../lib/i18n/vi";

export const dynamic = "force-dynamic";

const pct = (value: unknown) =>
  value === null || value === undefined
    ? "N/A"
    : `${Number(value).toFixed(1)}%`;

export default async function KpiClose(props: {
  searchParams?: Promise<{ month?: string; member?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");

  const month = searchParams?.month ?? new Date().toISOString().slice(0, 7);
  const [audit, memberOptions] = await Promise.all([
    listMonthlyKpiAudit(month),
    listMemberOptions(month, "close"),
  ]);
  const members = memberOptions.map((row) => row.memberName);
  const selectedMember = searchParams?.member ?? members[0];
  const selectedConfig = audit.configs.find(
    (row: any) => row.member_name === selectedMember,
  );
  const selectedWeights = Object.fromEntries(
    (selectedConfig?.config_components ?? []).map((row: any) => [
      row.componentKey,
      Number(row.weightPct),
    ]),
  );
  const lockedResults = audit.results
    .filter((row: any) => row.status === "locked")
    .map((row: any) => ({ id: String(row.id), memberName: row.member_name }));

  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 6/6
          </p>
          <h2 className="text-3xl font-bold">Chốt KPI — {month}</h2>
          <p className="mt-2 text-slate-600">
            Cấu hình từng Thành viên × Tháng, xem trước ba thành phần và chốt
            một kết quả bất biến. Mở lại luôn tạo phiên bản mới.
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
            Xem
          </button>
        </form>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Thành viên" value={members.length} />
          <MetricCard
            label="Thành viên-tháng đã cấu hình"
            value={audit.configs.length}
          />
          <MetricCard label="Phiên bản đã khóa" value={lockedResults.length} />
        </div>

        {selectedConfig ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Cấu hình đang áp dụng</h3>
            <p className="mt-2 text-sm text-slate-600">
              {selectedConfig.member_name} / {month} / version{" "}
              {selectedConfig.version}
              {selectedConfig.locked_at ? " / đã khóa" : " / có thể chỉnh sửa"}
            </p>
          </section>
        ) : null}

        <MemberKpiConfigForm
          month={month}
          members={members}
          selectedMember={selectedMember}
          initialConfig={
            selectedConfig
              ? {
                  socialVideoEnabled: Boolean(
                    selectedConfig.social_video_enabled,
                  ),
                  locked: selectedConfig.status === "locked",
                  weights: {
                    seoContent: Number(selectedWeights.seo_content ?? 0),
                    seoPerformance: Number(
                      selectedWeights.seo_performance ?? 0,
                    ),
                    socialVideo: Number(selectedWeights.social_video ?? 0),
                  },
                }
              : undefined
          }
        />
        <KpiCloseControls
          month={month}
          members={members}
          lockedResults={lockedResults}
        />

        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Thành viên</th>
                <th>Phiên bản</th>
                <th>Điểm thô</th>
                <th>Điểm chi trả</th>
                <th>Độ phủ</th>
                <th>Trạng thái</th>
                <th>Chi trả</th>
                <th>Đã khóa lúc</th>
              </tr>
            </thead>
            <tbody>
              {audit.results.map((row: any) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">{row.member_name}</td>
                  <td>{row.version}</td>
                  <td>{pct(row.raw_pct)}</td>
                  <td>{pct(row.payable_pct)}</td>
                  <td>{pct(row.coverage_pct)}</td>
                  <td>{viLabel(row.status)}</td>
                  <td>{row.payout_vnd?.toLocaleString?.("vi-VN") ?? "N/A"}</td>
                  <td>
                    {row.locked_at
                      ? formatViDateTime(row.locked_at)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
        <a
          className="inline-flex rounded-lg border px-4 py-2 font-semibold text-blue-700"
          href={`/api/admin/kpi-month/${month}/audit`}
        >
          Xuất audit JSON
        </a>
      </div>
    </Shell>
  );
}
