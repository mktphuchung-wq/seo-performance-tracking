import { query } from "../db";
import type { WorkEventStatus, WorkType } from "../domain/work-events";

type UrlWorkEventInput = {
  contentUrlId: string;
  project: string;
  memberName: string;
  memberEmail: string;
  workType: WorkType;
  workDate: string;
  difficulty?: string;
  unitValue?: number;
  source: string;
  sourceRowKey: string;
  status?: WorkEventStatus;
  note?: string | null;
};

type ExistingEvent = {
  id: string;
  content_url_id: string;
  project: string;
  member_name: string;
  member_email: string | null;
  work_type: string;
  work_date: string | Date;
  difficulty: string;
  unit_value: string | number;
  status: string;
  note: string | null;
};

export async function upsertUrlWorkEvent(input: UrlWorkEventInput): Promise<"inserted" | "updated" | "skipped"> {
  const existing = await query<ExistingEvent>(`select id::text, content_url_id::text, project, member_name, member_email, work_type, work_date, difficulty, unit_value, status, note
    from public.url_work_events where source=$1 and source_row_key=$2 limit 1`, [input.source, input.sourceRowKey]);
  const difficulty = input.difficulty ?? "normal";
  const unitValue = input.unitValue ?? 1;
  const status = input.status ?? "completed";
  const note = input.note ?? null;

  if (!existing.rows[0]) {
    const inserted = await query<{ id: string }>(`insert into public.url_work_events
      (content_url_id, project, member_name, member_email, work_type, work_date, difficulty, unit_value, source, source_row_key, status, note, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
      on conflict (source, source_row_key) do nothing
      returning id::text`, [input.contentUrlId, input.project, input.memberName, input.memberEmail, input.workType, input.workDate, difficulty, unitValue, input.source, input.sourceRowKey, status, note]);
    return inserted.rowCount ? "inserted" : "skipped";
  }

  const current = existing.rows[0];
  const currentDate = current.work_date instanceof Date ? current.work_date.toISOString().slice(0, 10) : String(current.work_date).slice(0, 10);
  const changed = current.content_url_id !== input.contentUrlId || current.project !== input.project ||
    current.member_name !== input.memberName || String(current.member_email ?? "") !== input.memberEmail ||
    current.work_type !== input.workType || currentDate !== input.workDate || current.difficulty !== difficulty ||
    Number(current.unit_value) !== unitValue || current.status !== status || String(current.note ?? "") !== String(note ?? "");
  if (!changed) return "skipped";

  // work_date is deliberately immutable for an existing source key. A different work
  // date creates a different deterministic source key and therefore a new event.
  await query(`update public.url_work_events set content_url_id=$2, project=$3, member_name=$4, member_email=$5,
    work_type=$6, difficulty=$7, unit_value=$8, status=$9, note=$10, updated_at=now()
    where id=$1`, [current.id, input.contentUrlId, input.project, input.memberName, input.memberEmail, input.workType, difficulty, unitValue, status, note]);
  return "updated";
}
