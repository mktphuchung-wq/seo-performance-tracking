import type { WorkEventStatus, WorkType } from "./work-events.ts";

export type AliasMap = Record<string, string>;

const trackingParameters = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "ref", "referrer",
]);

export function normalizeAliasKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function buildAliasMap(entries: Array<[string, string]>): AliasMap {
  return Object.fromEntries(entries.map(([alias, canonical]) => [normalizeAliasKey(alias), canonical.trim()]));
}

export const defaultProjectAliases = buildAliasMap([
  ["PrintYourWear", "Print Your Wear"],
  ["Print Your Wear", "Print Your Wear"],
  ["Polynesian Pride Blog", "Stories of Polynesian Pride"],
  ["Stories of Polynesian Pride", "Stories of Polynesian Pride"],
  ["Tartan Vibes Clothing", "Tartan Vibes Clothing"],
]);

export function resolveAlias(value: unknown, aliases: AliasMap): string | null {
  const key = normalizeAliasKey(value);
  if (!key) return null;
  return aliases[key] ?? null;
}

export function normalizeWorkType(value: unknown): WorkType | null {
  const key = normalizeAliasKey(value).replace(/[\s/-]+/g, "_");
  if (["new", "new_content", "content_moi", "content_mới", "new_post"].includes(key)) return "new_content";
  if (["audit", "audited", "audit_update", "audit_optimization", "url_audit"].includes(key)) return "audit";
  if (["update", "updated", "refresh", "content_update"].includes(key)) return "update";
  if (["old", "existing", "portfolio", "stable", "long_standing", "no_work_event"].includes(key)) return "portfolio";
  return null;
}

export type NormalizedSourceStatus = {
  status: WorkEventStatus | null;
  isPayableCandidate: boolean;
};

export function normalizeSourceStatus(value: unknown): NormalizedSourceStatus {
  const key = normalizeAliasKey(value).replace(/[\s/-]+/g, "_");
  if (["to_do", "todo", "planned"].includes(key)) return { status: "planned", isPayableCandidate: false };
  if (["need_review", "review", "in_progress", "doing"].includes(key)) return { status: "in_progress", isPayableCandidate: false };
  if (["checked", "reviewed"].includes(key)) return { status: "reviewed", isPayableCandidate: false };
  if (["completed", "complete", "done", "published"].includes(key)) return { status: "completed", isPayableCandidate: true };
  if (["approved", "admin_approval", "admin_approved"].includes(key)) return { status: "approved", isPayableCandidate: true };
  if (["hold", "on_hold", "paused"].includes(key)) return { status: "on_hold", isPayableCandidate: false };
  if (["excluded", "rejected", "reject"].includes(key)) return { status: "excluded", isPayableCandidate: false };
  return { status: null, isPayableCandidate: false };
}

export type NormalizedUrl = {
  originalUrl: string;
  canonicalUrl: string | null;
  hostname: string | null;
  isPublic: boolean;
  isDraftOrAdmin: boolean;
  error: string | null;
};

export function normalizeCanonicalUrl(value: unknown): NormalizedUrl {
  const originalUrl = String(value ?? "").trim();
  if (!originalUrl) return { originalUrl, canonicalUrl: null, hostname: null, isPublic: false, isDraftOrAdmin: false, error: "url_missing" };
  try {
    const url = new URL(originalUrl);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return { originalUrl, canonicalUrl: null, hostname: url.hostname || null, isPublic: false, isDraftOrAdmin: false, error: "url_protocol_unsupported" };
    }
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameters.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    const draftHost = /(^|\.)app\.bloggle\.app$/i.test(url.hostname);
    const adminPath = /\/(wp-admin|wp-login\.php|admin|editor)(\/|$)/i.test(url.pathname);
    const preview = url.searchParams.has("preview") || url.searchParams.has("preview_id");
    const isDraftOrAdmin = draftHost || adminPath || preview;
    return {
      originalUrl,
      canonicalUrl: url.toString(),
      hostname: url.hostname,
      isPublic: !isDraftOrAdmin,
      isDraftOrAdmin,
      error: null,
    };
  } catch {
    return { originalUrl, canonicalUrl: null, hostname: null, isPublic: false, isDraftOrAdmin: false, error: "url_invalid" };
  }
}

export function parseSourceDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? validDate(Number(match[3]), Number(match[2]), Number(match[1])) : null;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}
