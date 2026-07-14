const labels: Record<string, string> = {
  pending: "Đang chờ", running: "Đang chạy", success: "Thành công", failed: "Thất bại",
  skipped: "Đã bỏ qua", completed: "Hoàn tất", approved: "Đã duyệt", rejected: "Đã từ chối",
  draft: "Bản nháp", locked: "Đã khóa", synced: "Đã đồng bộ", source_approved: "Nguồn đã duyệt",
  events_persisted: "Sự kiện đã lưu", target_saved: "Chỉ tiêu đã lưu", quality_reviewed: "Chất lượng đã duyệt",
  performance_refreshed: "Performance đã làm mới", calculated: "Đã tính toán", excluded: "Đã loại trừ",
  insufficient_data: "Chưa đủ dữ liệu", not_enough_data: "Chưa đủ dữ liệu để đánh giá",
  system_error: "Lỗi hệ thống", available: "Có dữ liệu", unavailable: "Không có dữ liệu",
  enabled: "Đã bật", disabled: "Đã tắt", pm_review: "PM cần đánh giá",
  control_adjusted: "Đã điều chỉnh theo nhóm đối chứng", growth_project: "Dự án tăng trưởng",
  stable_project: "Dự án ổn định", new_project: "Dự án mới", new_content: "Nội dung mới",
  audit: "Audit", update: "Cập nhật", portfolio: "Danh mục", equal_event_average: "Trung bình đều theo sự kiện",
  discipline: "Kỷ luật", seo_content: "SEO Content", seo_performance: "SEO Performance", social_video: "Mạng xã hội / Video",
  quantity: "Số lượng", quality: "Chất lượng", finance: "Finance", pm: "PM",
  current_month: "Tháng hiện tại", previous_month: "Tháng trước", last_3_months: "3 tháng gần nhất",
  last_6_months: "6 tháng gần nhất", all_time: "Toàn thời gian",
  growing: "Đang tăng trưởng", new_signal: "Tín hiệu mới", declining: "Đang suy giảm", stable: "Ổn định",
  no_data: "Chưa đủ dữ liệu", high: "Cao", medium: "Trung bình", low: "Thấp",
  "Low sample": "Mẫu dữ liệu nhỏ", "Medium sample": "Mẫu dữ liệu trung bình", "High confidence": "Độ tin cậy cao",
  Refreshed: "Đã làm mới", "Not refreshed yet": "Chưa được làm mới", "Needs data": "Cần thêm dữ liệu",
  "Needs support": "Cần hỗ trợ", "Strong performer": "Hiệu suất tốt", Growing: "Đang tăng trưởng", Stable: "Ổn định",
  "Data gaps": "Thiếu hụt dữ liệu", "At risk": "Có rủi ro", "Healthy growth": "Tăng trưởng tốt", Monitor: "Cần theo dõi",
  scored: "Đã chấm điểm", neutral_score: "Điểm trung tính", exclude: "Loại trừ", mild_penalty: "Phạt nhẹ",
  all_active_urls: "Tất cả URL đang hoạt động", lagged_before_window: "Trước cửa sổ sau khi tính độ trễ",
  url_age_1m: "URL đủ 1 tháng", url_age_3m: "URL đủ 3 tháng", url_age_6m: "URL đủ 6 tháng",
  previous_month_work: "Công việc tháng trước", previous_3_month_work: "Công việc 3 tháng trước",
  previous_6_month_work: "Công việc 6 tháng trước", cohort_mode_1m: "Chế độ nhóm 1M",
  cohort_mode_3m: "Chế độ nhóm 3M", cohort_mode_6m: "Chế độ nhóm 6M", cohort_mode_all_time: "Chế độ nhóm toàn thời gian",
};

export function uiLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return labels[value] ?? value.replace(/_/g, " ");
}

export function yesNo(value: boolean) {
  return value ? "Có" : "Không";
}
