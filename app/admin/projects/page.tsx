import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { DataTableContainer, Shell } from "../../../components/ui";
import { ProjectSettingsForm } from "../../../components/unified-workflows";
import { listUnifiedProjectSettings } from "../../../lib/repositories/project-settings";
import { listSearchConsoleProperties } from "../../../lib/google";
import { viLabel } from "../../../lib/i18n/vi";
export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin) redirect("/");
  const data = await listUnifiedProjectSettings();
  const gscProperties = session.accessToken
    ? await listSearchConsoleProperties(session.accessToken).catch(() => [])
    : [];
  return (
    <Shell email={session.user.email} isAdmin>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase text-blue-700">
            Quy trình quản trị 2/6
          </p>
          <h2 className="text-3xl font-bold">Cấu hình dự án</h2>
          <p className="mt-2 text-slate-600">
            Chọn dự án đã đồng bộ, xác nhận domain và thuộc tính GSC có quyền
            truy cập, sau đó duyệt vòng đời cùng quy tắc 3T/6T/Toàn thời gian.
          </p>
        </header>
        <ProjectSettingsForm
          options={data.options}
          gscProperties={gscProperties}
          googleAccount={{
            email: session.user.email,
            tokenError: session.error ?? null,
            tokenExpiresAt: session.tokenExpiresAt ?? null,
          }}
        />
        <DataTableContainer>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Dự án</th>
                <th>Domain</th>
                <th>Vòng đời</th>
                <th>Eligibility GSC</th>
                <th>Eligibility Nội dung</th>
                <th>3T / 6T / Toàn thời gian</th>
                <th>Phiên bản</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((row: any) => (
                <tr className="border-t" key={row.id}>
                  <td className="p-3">{row.canonical_name}</td>
                  <td>{row.canonical_domain ?? "Chưa cấu hình"}</td>
                  <td>{viLabel(row.lifecycle ?? "Chưa cấu hình")}</td>
                  <td>{row.gsc_ready ? "Đủ điều kiện" : "Chưa đủ điều kiện"}</td>
                  <td>{row.kpi_ready ? "Đủ điều kiện" : "Chưa đủ điều kiện"}</td>
                  <td>
                    {row.performance_weight_3m_pct ?? "—"} /{" "}
                    {row.performance_weight_6m_pct ?? "—"} /{" "}
                    {row.performance_weight_all_time_pct ?? "—"}
                  </td>
                  <td>{row.version ?? "—"}</td>
                  <td>{viLabel(row.status ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableContainer>
      </div>
    </Shell>
  );
}
