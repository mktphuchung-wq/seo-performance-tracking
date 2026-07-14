import { query } from "../db";
import { normalizeAliasKey, type AliasMap } from "../domain/normalization";

export async function getMemberAliases(): Promise<AliasMap> {
  const result = await query<{ alias: string; canonical_name: string }>(`select a.alias, m.canonical_name
    from public.member_aliases a join public.members m on m.id=a.member_id where a.is_active=true and m.is_active=true`);
  return Object.fromEntries(result.rows.map((row) => [normalizeAliasKey(row.alias), row.canonical_name]));
}

export async function upsertMemberAlias(alias: string, canonicalName: string, email: string | null, actor: string) {
  return query(`with member as (
    insert into public.members (canonical_name, email) values ($2,$3)
    on conflict (canonical_name) do update set email=coalesce(excluded.email,public.members.email), updated_at=now() returning id
  ) insert into public.member_aliases (member_id, alias, alias_key, created_by)
    select id,$1,$4,$5 from member
    on conflict (alias_key) do update set member_id=excluded.member_id, alias=excluded.alias, is_active=true, updated_at=now()
    returning *`, [alias.trim(), canonicalName.trim(), email?.toLowerCase() || null, normalizeAliasKey(alias), actor]);
}
