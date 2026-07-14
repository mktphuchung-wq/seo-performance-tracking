import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server.js";

export class KpiApiError extends Error {
  code: string;
  status: number;
  field: string | null;
  retryable: boolean;

  constructor(
    code: string,
    message: string,
    status = 400,
    field: string | null = null,
    retryable = false,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryable = retryable;
  }
}

export const createRequestId = () => randomUUID();

function localizeMessage(message: string) {
  const exact: Record<string, string> = {
    "Admin access is required.": "Cần quyền quản trị viên.",
    "Google access token is missing. Sign out and sign in with consent again.": "Thiếu access token Google. Hãy đăng xuất rồi đăng nhập lại và cấp quyền.",
    "Month must use YYYY-MM format.": "Tháng phải có định dạng YYYY-MM.",
    "Request body must be valid JSON.": "Nội dung yêu cầu phải là JSON hợp lệ.",
    "Request body must be a JSON object.": "Nội dung yêu cầu phải là một đối tượng JSON.",
    "Idempotency-Key header is required for this workflow action.": "Thao tác quy trình này bắt buộc có header Idempotency-Key.",
    "Idempotency-Key must be at most 200 characters.": "Idempotency-Key không được dài quá 200 ký tự.",
    "This Idempotency-Key was already used with a different request.": "Idempotency-Key này đã được dùng cho một yêu cầu khác.",
    "An identical workflow action is already running.": "Một thao tác quy trình giống hệt đang chạy.",
    "The previous identical request failed. Use a new Idempotency-Key after correcting the cause.": "Yêu cầu giống hệt trước đó đã thất bại. Sau khi khắc phục nguyên nhân, hãy dùng Idempotency-Key mới.",
    "Sign-in is required.": "Bạn cần đăng nhập.",
    "Members can only view their own KPI.": "Thành viên chỉ có thể xem KPI của chính mình.",
    "Member identity is not configured for this account.": "Tài khoản này chưa được cấu hình danh tính thành viên.",
    "At least one review is required.": "Cần ít nhất một đánh giá.",
    "Invalid approval status.": "Trạng thái phê duyệt không hợp lệ.",
  };
  if (exact[message]) return exact[message];
  const required = message.match(/^(.+) is required\.$/);
  if (required) return `Bắt buộc nhập ${required[1]}.`;
  const finite = message.match(/^(.+) must be a finite number\.$/);
  if (finite) return `${finite[1]} phải là một số hữu hạn.`;
  if (/ must be an array\.$/.test(message)) return message.replace(" must be an array.", " phải là một mảng.");
  return message;
}

export function parseMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new KpiApiError("INVALID_MONTH", "Month must use YYYY-MM format.", 400, "month");
  return value;
}

export function requireString(value: unknown, field: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new KpiApiError("VALIDATION_ERROR", `${field} is required.`, 400, field);
  return parsed;
}

export function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new KpiApiError("VALIDATION_ERROR", `${field} must be a finite number.`, 400, field);
  return parsed;
}

export async function readJsonObject(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new KpiApiError("INVALID_JSON", "Request body must be valid JSON.", 400, "body"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new KpiApiError("INVALID_BODY", "Request body must be a JSON object.", 400, "body");
  return body as Record<string, any>;
}

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) throw new KpiApiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required for this workflow action.", 400, "Idempotency-Key");
  if (key.length > 200) throw new KpiApiError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be at most 200 characters.", 400, "Idempotency-Key");
  return key;
}

export function apiErrorResponse(error: unknown, requestId: string, fallback = "Quy trình KPI tháng thất bại") {
  const known = error instanceof KpiApiError;
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]") : fallback;
  const schemaMissing = !known && (/relation .+ does not exist/i.test(message) || /column .+ does not exist/i.test(message));
  const flagOff = !known && /KPI Engine v2 (?:is disabled|đang tắt)/i.test(message);
  const productionGuard = !known && /(?:production writes are locked|trên production bị khóa)/i.test(message);
  const databaseMissing = !known && /DATABASE_URL is required/i.test(message);
  const status = known ? error.status : schemaMissing || databaseMissing ? 503 : flagOff || productionGuard ? 409 : 500;
  const code = known ? error.code : schemaMissing ? "KPI_SCHEMA_MISSING" : databaseMissing ? "DATABASE_NOT_CONFIGURED"
    : flagOff ? "KPI_ENGINE_DISABLED" : productionGuard ? "PRODUCTION_WRITE_LOCKED" : "KPI_WORKFLOW_ERROR";
  const actionableMessage = schemaMissing
    ? "Schema KPI tháng v2 bị thiếu hoặc chưa hoàn chỉnh. Hãy áp dụng các migration đã hướng dẫn trên nhánh staging riêng rồi thử lại."
    : localizeMessage(message);
  return NextResponse.json({
    error: {
      code,
      message: actionableMessage,
      field: known ? error.field : null,
      retryable: known ? error.retryable : false,
      requestId,
    },
  }, { status, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });
}

export function apiSuccess(payload: unknown, requestId: string, status = 200) {
  return NextResponse.json({ requestId, ...((payload && typeof payload === "object") ? payload as Record<string, unknown> : { result: payload }) }, {
    status,
    headers: { "x-request-id": requestId, "Cache-Control": "no-store" },
  });
}
