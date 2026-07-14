import { query } from "../db";
import { normalizeCanonicalUrl } from "../domain/normalization";

export async function resolveContentUrlAlias(value: string): Promise<string | null> {
  const normalized = normalizeCanonicalUrl(value).canonicalUrl;
  if (!normalized) return null;
  const result = await query<{ canonical_url: string }>(`select c.url as canonical_url
    from public.content_url_aliases a join public.content_urls c on c.id=a.content_url_id
    where a.alias_url=$1 and a.is_active=true limit 1`, [normalized]);
  return result.rows[0]?.canonical_url ?? normalized;
}

export async function upsertContentUrlAlias(contentUrlId: string, aliasUrl: string, aliasType: string, actor: string) {
  const normalized = normalizeCanonicalUrl(aliasUrl).canonicalUrl;
  if (!normalized) throw new Error("A valid URL alias is required.");
  return query(`insert into public.content_url_aliases (content_url_id,alias_url,alias_type,created_by)
    values ($1,$2,$3,$4) on conflict (alias_url) do update set content_url_id=excluded.content_url_id,
    alias_type=excluded.alias_type,is_active=true,updated_at=now() returning *`, [contentUrlId, normalized, aliasType, actor]);
}
