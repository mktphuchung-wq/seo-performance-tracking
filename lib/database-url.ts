export function normalizePostgresConnectionString(value: string) {
  const url = new URL(value);
  const sslMode = url.searchParams.get("sslmode");
  const isNeon = url.hostname.endsWith(".neon.tech");

  if (isNeon && ["prefer", "require", "verify-ca"].includes(sslMode ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
