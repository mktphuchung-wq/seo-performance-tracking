import type { DbSchemaHealth } from "../lib/db-health";

export function SchemaMigrationRequired({
  schema,
}: {
  schema: DbSchemaHealth;
}) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide">
        Cần cập nhật database
      </p>
      <h2 className="mt-2 text-2xl font-bold">
        Schema Monthly KPI v2 chưa được áp dụng
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6">
        Bản triển khai mới hơn database đang kết nối. Trang được dừng trước khi
        chạy SQL không tương thích để tránh lỗi thiếu cột khó hiểu.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase text-amber-800">
            Thiếu bảng
          </div>
          <div className="mt-1 text-2xl font-bold">
            {schema.missingTables.length}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase text-amber-800">
            Thiếu cột
          </div>
          <div className="mt-1 text-2xl font-bold">
            {schema.missingColumns.length}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm">
        Trước tiên áp dụng chuỗi migration bằng <code>npm run db:migrate:unified</code>{" "}
        trên database Preview cô lập. Sau khi kiểm tra health endpoint, migration
        production vẫn cần một phê duyệt riêng.
      </p>
      {schema.migrationWarnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {schema.migrationWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
