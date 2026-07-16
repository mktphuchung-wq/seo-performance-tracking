import crypto from "crypto";
import { NextResponse } from "next/server";
import { ContentSheetContractError } from "../sync/content-urls-sheet";
import { SchemaMigrationRequiredError } from "../schema-readiness";

export function requestIdFor(request: Request) {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function apiErrorResponse(
  error: unknown,
  requestId: string,
  fallback: string,
  status = 400,
) {
  const contract = error instanceof ContentSheetContractError ? error : null;
  const schema = error instanceof SchemaMigrationRequiredError ? error : null;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code: contract?.code ?? schema?.code ?? "request_failed",
      details: contract?.details ?? schema?.details ?? undefined,
      requestId,
    },
    {
      status: schema?.status ?? status,
      headers: { "x-request-id": requestId },
    },
  );
}

export function apiOk(
  payload: Record<string, unknown>,
  requestId: string,
  init?: ResponseInit,
) {
  return NextResponse.json(
    { ok: true, ...payload, requestId },
    { ...init, headers: { ...init?.headers, "x-request-id": requestId } },
  );
}
