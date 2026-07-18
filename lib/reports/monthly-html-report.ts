import type { AdminOverview } from "../services/admin-overview-service";

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const pct = (value: unknown) =>
  value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)}%`;
const num = (value: unknown) => Number(value ?? 0).toLocaleString("vi-VN");

export function renderMonthlyHtmlReport(data: AdminOverview) {
  const title = `Báo cáo KPI SEO tháng ${data.filters.month}`;
  const rows = data.members.map((row: any) => `<tr>
    <td>${escapeHtml(row.member_name)}</td><td>${num(row.url_count)}</td><td>${num(row.work_units)}</td>
    <td>${pct(row.performance_pct)}</td><td>${pct(row.performance_coverage)}</td>
    <td>${pct(row.kpi_payable_pct)}</td><td>${escapeHtml(row.kpi_status ?? "N/A")}</td>
    <td>${escapeHtml(row.kpi_rule_version ?? "N/A")}</td></tr>`).join("");
  const warnings = data.warnings.length
    ? `<ul>${data.warnings.map((row: any) => `<li>${escapeHtml(row.code)}: ${num(row.count)}</li>`).join("")}</ul>`
    : "<p>Không có cảnh báo dữ liệu.</p>";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title><style>
  :root{font-family:Arial,sans-serif;color:#0f172a}body{max-width:1100px;margin:32px auto;padding:0 24px}h1{margin-bottom:6px}.muted{color:#64748b}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{border:1px solid #cbd5e1;border-radius:10px;padding:14px}.card strong{display:block;font-size:24px;margin-top:6px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9}.warning{border:1px solid #f59e0b;background:#fffbeb;padding:14px;border-radius:10px;margin:18px 0}@media print{@page{size:A4 landscape;margin:12mm}body{margin:0;padding:0}.no-print{display:none}.cards{grid-template-columns:repeat(4,1fr)}}
  </style></head><body><h1>${escapeHtml(title)}</h1>
  <p class="muted">Tạo lúc ${escapeHtml(data.generatedAt)} · Dữ liệu đến ${escapeHtml(data.dataThrough ?? "N/A")} · Project ${escapeHtml(data.filters.project ?? "Tất cả")} · Member ${escapeHtml(data.filters.member ?? "Tất cả")}</p>
  <section class="cards"><div class="card">URL<strong>${num(data.summary.urlCount)}</strong></div><div class="card">Work units<strong>${num(data.summary.payableWorkUnits)}</strong></div><div class="card">Review đã duyệt<strong>${num(data.summary.approvedReviews)}</strong></div><div class="card">GSC lỗi<strong>${num(data.summary.fetchErrors)}</strong></div></section>
  <section class="warning"><strong>Cảnh báo và giới hạn</strong>${warnings}</section>
  <h2>Tổng hợp thành viên</h2><table><thead><tr><th>Thành viên</th><th>URL</th><th>Work units</th><th>Performance tháng</th><th>Độ phủ</th><th>KPI chi trả</th><th>Trạng thái</th><th>Rule version</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Không có dữ liệu trong bộ lọc.</td></tr>'}</tbody></table>
  <p class="muted">N/A được giữ nguyên khi dữ liệu thiếu hoặc không đáng tin cậy; không được quy đổi thành 0. Báo cáo này là HTML tự chứa và không bao gồm secret, token hoặc chuỗi kết nối nội bộ.</p></body></html>`;
}
