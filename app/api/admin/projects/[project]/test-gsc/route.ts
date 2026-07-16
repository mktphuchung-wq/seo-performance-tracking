import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  apiOk,
  requestIdFor,
} from "../../../../../../lib/api/errors";
import { authOptions } from "../../../../../../lib/auth";
import { testSearchConsolePropertyAccess } from "../../../../../../lib/google";
import { gscPropertyCoversUrl } from "../../../../../../lib/domain/project-settings";
import {
  getUnifiedProjectConfig,
  recordProjectGscVerification,
} from "../../../../../../lib/repositories/project-settings";

type Context = { params: Promise<{ project: string }> };
export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.isAdmin)
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền thực hiện thao tác này.", code: "forbidden", requestId },
      { status: 403 },
    );
  if (!session.accessToken)
    return NextResponse.json(
      {
        ok: false,
        error: "Thiếu phiên truy cập Google. Hãy đăng nhập lại bằng Google.",
        code: "google_token_missing",
        requestId,
      },
      { status: 401 },
    );
  try {
    const [{ project }, body] = await Promise.all([context.params, request.json()]);
    const projectName = decodeURIComponent(project);
    const config = await getUnifiedProjectConfig(projectName);
    const selectedProperty = String(body.gscProperty ?? "").trim();
    if (!selectedProperty) throw new Error("Hãy chọn thuộc tính GSC cần xác minh.");
    const includeSubdomains = Boolean(body.includeSubdomains);
    const access = await testSearchConsolePropertyAccess({
      accessToken: session.accessToken,
      siteUrl: selectedProperty,
    });
    const scopeCandidates = config.option.detectedDomains.map(
      (row) => row.sampleUrl || `https://${row.domain}/`,
    );
    const covered =
      scopeCandidates.length > 0 &&
      scopeCandidates.every((candidate) =>
        gscPropertyCoversUrl(selectedProperty, candidate, includeSubdomains),
      );
    const verification = await recordProjectGscVerification({
      projectName,
      gscProperty: selectedProperty,
      permissionLevel: access.property?.permissionLevel ?? null,
      accessStatus: access.accessStatus,
      domainScopeStatus: covered ? "covered" : "outside_scope",
      testQueryStatus: access.testQueryStatus,
      includeSubdomains,
      actor: session.user.email,
      errorCode: access.errorCode,
      diagnostics: { scopeCandidates, queryRows: access.queryRows ?? 0 },
    });
    return apiOk(
      {
        project: config.option.project,
        selectedProperty,
        accessible: access.accessStatus === "verified",
        scopeCovered: covered,
        property: access.property,
        verification,
      },
      requestId,
    );
  } catch (error) {
    return apiErrorResponse(error, requestId, "Xác minh quyền GSC không thành công");
  }
}
