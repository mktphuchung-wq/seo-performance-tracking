import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, requiredGoogleScopes } from "../../../../lib/auth";
import { appConfig } from "../../../../lib/env";

export async function GET() {
  const session = await getServerSession(authOptions);
  const configuredScopes = String(authOptions.providers.find((provider) => provider.id === "google")?.options?.authorization?.params?.scope ?? "").split(/\s+/).filter(Boolean);

  return NextResponse.json({
    ok: true,
    signedIn: Boolean(session?.user?.email),
    userEmail: session?.user?.email ?? null,
    hasAccessToken: Boolean(session?.accessToken),
    tokenExpiresAt: session?.tokenExpiresAt ?? null,
    requiredScopesConfigured: requiredGoogleScopes.every((scope) => configuredScopes.includes(scope)),
    googleSheetIdPresent: Boolean(appConfig.sheetId),
    googleSheetTabPresent: Boolean(appConfig.contentTab)
  });
}
