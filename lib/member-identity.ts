import { getMemberEmailMap } from "./env";
import { query } from "./db";

export async function resolveMemberNameByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  try {
    const result = await query<{ canonical_name: string }>(`select canonical_name from public.members
      where is_active=true and lower(email)=$1 limit 1`, [normalized]);
    if (result.rows[0]) return result.rows[0].canonical_name;
  } catch (error) {
    // The environment map is a migration fallback only when the additive identity schema is not installed yet.
    if (!String(error).includes("members")) throw error;
  }
  return Object.entries(getMemberEmailMap()).find(([,configuredEmail])=>configuredEmail.toLowerCase()===normalized)?.[0] ?? null;
}
