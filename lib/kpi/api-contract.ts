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

export function apiErrorResponse(error: unknown, requestId: string, fallback = "Monthly KPI workflow failed") {
  const known = error instanceof KpiApiError;
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database url]") : fallback;
  const schemaMissing = !known && (/relation .+ does not exist/i.test(message) || /column .+ does not exist/i.test(message));
  const flagOff = !known && /KPI Engine v2 is disabled/i.test(message);
  const productionGuard = !known && /production writes are locked/i.test(message);
  const databaseMissing = !known && /DATABASE_URL is required/i.test(message);
  const status = known ? error.status : schemaMissing || databaseMissing ? 503 : flagOff || productionGuard ? 409 : 500;
  const code = known ? error.code : schemaMissing ? "KPI_SCHEMA_MISSING" : databaseMissing ? "DATABASE_NOT_CONFIGURED"
    : flagOff ? "KPI_ENGINE_DISABLED" : productionGuard ? "PRODUCTION_WRITE_LOCKED" : "KPI_WORKFLOW_ERROR";
  const actionableMessage = schemaMissing
    ? "Monthly KPI v2 schema is missing or incomplete. Apply the documented migrations to the dedicated staging branch and retry."
    : message;
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
