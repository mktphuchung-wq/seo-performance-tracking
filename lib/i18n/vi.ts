const labels: Record<string, string> = {
  new_project: "New Growth",
  growth_project: "Growth",
  stable_project: "Stable Audit",
  stable_audit: "Stable Audit",
  scored: "Đã chấm",
  fallback_scored: "Đã chấm bằng cửa sổ ngắn",
  provisional: "Điểm tạm tính",
  pm_review_required: "Cần PM đánh giá",
  pm_review: "Cần PM đánh giá",
  insufficient_data: "Chưa đủ dữ liệu để chấm đầy đủ",
  blocked_system_error: "Lỗi hệ thống hoặc quyền dữ liệu",
  system_error: "Lỗi hệ thống",
  approved: "Đã duyệt",
  draft: "Bản nháp",
  locked: "Đã khóa",
  superseded: "Đã thay thế",
  accepted: "Đã chấp nhận",
  pending: "Chờ phân loại",
  quarantined: "Cần xử lý",
  observed: "Đã quan sát",
  observed_zero: "Đã quan sát, giá trị bằng 0",
  not_fetched: "Chưa tải",
  fetch_error: "Lỗi tải GSC",
  not_observed: "Chưa quan sát",
  outside_scope: "Ngoài phạm vi đã xác minh",
  not_run: "Chưa chạy",
  unknown: "Không thể quan sát",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
  new_content: "Nội dung mới",
  audit: "Audit",
  update: "Cập nhật",
  portfolio: "Danh mục nền",
  full: "Đầy đủ",
  fallback: "Cửa sổ ngắn",
  active: "Đang hoạt động",
  inactive: "Không hoạt động",
  eligible: "Đủ điều kiện",
  blocked: "Bị chặn",
  review_pending: "Chờ đánh giá",
  completed: "Hoàn tất",
  failed: "Thất bại",
  partial: "Hoàn tất một phần",
  configuration_required: "Cần cấu hình",
  preview: "Xem trước",
  committed: "Đã ghi",
  seo_content: "SEO Nội dung",
  seo_performance: "SEO Hiệu suất",
  social_video: "Social + Video",
};

const reasons: Record<string, string> = {
  gsc_property_unverified: "Thuộc tính GSC chưa được xác minh",
  classification_pending: "URL chưa được phân loại xong",
  project_domain_unapproved: "Hostname chưa thuộc mapping dự án đã duyệt",
  project_settings_missing: "Thiếu cấu hình dự án",
  post_window_incomplete: "Cửa sổ sau công việc chưa hoàn tất",
  gsc_unknown_pm_review: "Không thể quan sát dữ liệu GSC; cần PM kiểm tra",
  project_settings_not_approved: "Cấu hình dự án chưa được duyệt",
  source_missing: "Không còn trong nguồn dữ liệu chuẩn",
  no_eligible_events: "Chưa có event đủ điều kiện",
  duplicate_effective_horizon_removed: "Đã loại cửa sổ hiệu lực bị trùng",
  property_not_accessible: "Không có quyền truy cập thuộc tính GSC đã chọn",
  weights_must_total_100:
    "Trọng số 3T/6T/Toàn thời gian chưa được cấu hình đủ 100%",
  no_scored_project_work_units:
    "Chưa có dự án đủ dữ liệu để tính điểm; hãy duyệt cấu hình và làm mới GSC",
  performance_not_refreshed:
    "Chưa làm mới dữ liệu Hiệu suất cho tháng đã chọn",
  no_event: "Chưa có Content event đủ điều kiện trong tháng",
};

export const viLabel = (value: unknown) => {
  const key = String(value ?? "");
  return labels[key] ?? key.replace(/_/g, " ");
};
export const viReason = (value: unknown) => {
  const key = String(value ?? "");
  return reasons[key] ?? viLabel(key);
};
export const formatViDateTime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(String(value)))
    : "—";
