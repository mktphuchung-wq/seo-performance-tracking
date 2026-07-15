import crypto from "crypto";

type PreviewAuthEnv = Record<string, string | undefined>;

export type PreviewTestIdentity = { email: string; role: "admin" | "member" };

export function previewTestAuthConfig(env: PreviewAuthEnv = process.env) {
  if (env.E2E_TEST_AUTH_ENABLED !== "true") return null;
  if (env.VERCEL_ENV !== "preview") return null;
  const secret = env.E2E_TEST_AUTH_SECRET?.trim();
  const adminEmail = env.E2E_TEST_ADMIN_EMAIL?.trim().toLowerCase();
  const memberEmail = env.E2E_TEST_MEMBER_EMAIL?.trim().toLowerCase();
  if (!secret || secret.length < 24 || !adminEmail || !memberEmail) return null;
  return {
    secret,
    identities: new Map<string, PreviewTestIdentity>([
      [adminEmail, { email: adminEmail, role: "admin" }],
      [memberEmail, { email: memberEmail, role: "member" }],
    ]),
  };
}

export function authorizePreviewTestIdentity(
  emailInput: unknown,
  secretInput: unknown,
  env: PreviewAuthEnv = process.env,
) {
  const config = previewTestAuthConfig(env);
  if (!config) return null;
  const email = String(emailInput ?? "")
    .trim()
    .toLowerCase();
  const provided = Buffer.from(String(secretInput ?? ""));
  const expected = Buffer.from(config.secret);
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  )
    return null;
  return config.identities.get(email) ?? null;
}
