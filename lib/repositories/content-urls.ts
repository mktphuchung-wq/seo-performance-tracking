import { query } from "../db";
import { canonicalContentUrlHash } from "../domain/work-events";

type CanonicalContentUrlInput = {
  project: string;
  normalizedUrl: string;
  memberName: string;
  memberEmail: string;
  gscProperty: string | null;
  contentWorkedAt: string | null;
  contentType: string | null;
};

type ContentUrlRow = {
  id: string;
  project: string;
  url: string;
  member_name: string;
  member_email: string | null;
  gsc_property: string | null;
  is_active: boolean | null;
  content_worked_at: string | Date | null;
  content_type: string | null;
};

const dbDate = (value: string | Date | null) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10) || null;

export async function upsertCanonicalContentUrl(input: CanonicalContentUrlInput): Promise<{ id: string; outcome: "inserted" | "updated" | "unchanged" }> {
  const hash = canonicalContentUrlHash(input.project, input.normalizedUrl);
  const existing = await query<ContentUrlRow>(`select id::text, project, url, member_name, member_email, gsc_property, is_active, content_worked_at, content_type
    from public.content_urls
    where (trim(project) = $1 and url = $2) or url_hash = $3
    order by coalesce(is_active, true) desc, updated_at desc nulls last
    limit 1`, [input.project, input.normalizedUrl, hash]);

  if (!existing.rows[0]) {
    const inserted = await query<{ id: string }>(`insert into public.content_urls
      (url_hash, project, url, member_name, member_email, gsc_property, content_worked_at, content_type, is_active, source, first_seen_at, last_seen_at, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,true,'google_sheet',now(),now(),now(),now())
      returning id::text`, [hash, input.project, input.normalizedUrl, input.memberName, input.memberEmail, input.gscProperty, input.contentWorkedAt, input.contentType]);
    return { id: inserted.rows[0].id, outcome: "inserted" };
  }

  const current = existing.rows[0];
  const currentDate = dbDate(current.content_worked_at);
  const incomingIsLatest = Boolean(input.contentWorkedAt && (!currentDate || input.contentWorkedAt >= currentDate));
  const nextDate = incomingIsLatest ? input.contentWorkedAt : currentDate;
  const nextType = incomingIsLatest ? input.contentType : current.content_type;
  const nextMemberName = incomingIsLatest || !current.member_name ? input.memberName : current.member_name;
  const nextMemberEmail = incomingIsLatest || !current.member_email ? input.memberEmail : current.member_email;
  const changed = current.project !== input.project || current.url !== input.normalizedUrl ||
    String(current.member_name ?? "") !== nextMemberName || String(current.member_email ?? "") !== String(nextMemberEmail ?? "") ||
    String(current.gsc_property ?? "") !== String(input.gscProperty ?? "") || currentDate !== nextDate ||
    String(current.content_type ?? "") !== String(nextType ?? "") || current.is_active !== true;

  await query(`update public.content_urls set project=$2, url=$3, member_name=$4, member_email=$5, gsc_property=$6,
    content_worked_at=$7, content_type=$8, is_active=true, source='google_sheet', last_seen_at=now(), updated_at=now()
    where id=$1`, [current.id, input.project, input.normalizedUrl, nextMemberName, nextMemberEmail, input.gscProperty, nextDate, nextType]);
  return { id: current.id, outcome: changed ? "updated" : "unchanged" };
}

export async function deactivateMissingSheetContentUrls(activeIds: string[]) {
  if (activeIds.length) {
    return query(`update public.content_urls set is_active=false, updated_at=now()
      where source='google_sheet' and coalesce(is_active,true)=true and not (id = any($1::uuid[]))`, [activeIds]);
  }
  // An empty or wholly invalid fetch is not proof that every source row was deleted.
  // Treat it as an incomplete sync and preserve the last known-good inventory.
  return { rows: [], rowCount: 0 };
}
