import { query } from "../db";
import { normalizeAliasKey, type AliasMap } from "../domain/normalization";

export async function getProjectAliases(): Promise<AliasMap> {
  const result = await query<{ alias: string; canonical_name: string }>(`select a.alias, p.canonical_name
    from public.project_aliases a join public.projects p on p.id=a.project_id where a.is_active=true`);
  return Object.fromEntries(result.rows.map((row) => [normalizeAliasKey(row.alias), row.canonical_name]));
}

export async function upsertProjectAlias(alias: string, canonicalName: string, actor: string) {
  return query(`with project as (
    insert into public.projects (canonical_name) values ($2)
    on conflict (canonical_name) do update set updated_at=now() returning id
  ) insert into public.project_aliases (project_id, alias, alias_key, created_by)
    select id,$1,$3,$4 from project
    on conflict (alias_key) do update set project_id=excluded.project_id, alias=excluded.alias, is_active=true, updated_at=now()
    returning *`, [alias.trim(), canonicalName.trim(), normalizeAliasKey(alias), actor]);
}
