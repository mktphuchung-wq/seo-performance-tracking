export function KpiLoadError({ requestId, message }: { requestId: string; message: string }) {
  const schema = /relation|column|schema|does not exist/i.test(message);
  const config = /DATABASE_URL|configured|environment/i.test(message);
  return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
    <h2 className="text-xl font-bold">Không thể tải dữ liệu KPI tháng</h2>
    <p className="mt-2 text-sm">{schema ? "Cơ sở dữ liệu staging đang thiếu migration KPI bắt buộc." : config ? "Cấu hình triển khai chưa đầy đủ." : "Truy vấn cơ sở dữ liệu thất bại; đây không phải trạng thái không có dữ liệu."}</p>
    <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
      {schema && <li>Áp dụng các migration đến <code>20260714_monthly_kpi_v2_completion.sql</code> trên nhánh staging riêng.</li>}
      <li>Xác nhận bản preview đang trỏ đến cơ sở dữ liệu staging và chỉ đặt <code>KPI_ENGINE_V2_ENABLED=true</code> tại đó.</li>
      <li>Thử lại; nếu vẫn lỗi, gửi mã yêu cầu <code>{requestId}</code> cho người phụ trách kỹ thuật.</li>
    </ol>
  </section>;
}
