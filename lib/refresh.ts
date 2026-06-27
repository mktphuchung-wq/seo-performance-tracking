import { query } from "./db";
import { getContentUrls, getUrlPerformance, type ContentUrl } from "./google";
import { filterRowsForEmail } from "./google";
import { getDateRange, type DateRange } from "./dates";
import { getPreviousRange } from "./growth";
import { getDbContentUrls, getDbPerformance, upsertMemberSnapshots, upsertUrlSnapshot } from "./postgres";

export async function syncSheetToDb(accessToken: string) {
  const rows = await getContentUrls(accessToken);
  for (const row of rows) {
    await query(`insert into content_urls (project, url, member_name, member_email, gsc_property, is_active, updated_at)
      values ($1,$2,$3,$4,$5,true,now())
      on conflict (url) do update set project=excluded.project, member_name=excluded.member_name, member_email=excluded.member_email, gsc_property=excluded.gsc_property, is_active=true, updated_at=now()`,
      [row.project, row.url, row.member_name, row.memberEmail, row.gscProperty ?? null]);
  }
  await query("insert into sync_runs (source, status, rows_synced, finished_at, created_at) values ('google_sheet','success',$1,now(),now())", [rows.length]).catch(()=>Promise.resolve({ rows: [], rowCount: 0 }));
  return { rowsSynced: rows.length };
}

export async function createRefreshJob(rangeKey: string, range: DateRange, requestedBy?: string) {
  const job = await query<{ id: string }>(`insert into refresh_jobs (range_key, start_date, end_date, status, requested_by, created_at, updated_at)
    values ($1,$2,$3,'pending',$4,now(),now()) returning id`, [rangeKey, range.startDate, range.endDate, requestedBy ?? null]);
  const urls = await getDbContentUrls();
  for (const row of urls) await query("insert into refresh_job_items (refresh_job_id, content_url_id, status, created_at, updated_at) values ($1,$2,'pending',now(),now())", [job.rows[0].id, row.id]);
  return { jobId: job.rows[0].id, itemCount: urls.length };
}

async function processRange(rows: ContentUrl[], accessToken: string, rangeKey: string, range: DateRange) {
  const byProperty = Object.values(rows.reduce<Record<string, ContentUrl[]>>((a,r)=>{ if (r.gscProperty) (a[r.gscProperty]??=[]).push(r); return a; }, {}));
  for (const group of byProperty) {
    // getUrlPerformance issues page-dimension Search Console calls; grouping keeps work property-oriented for batch execution.
    const perf = await getUrlPerformance(group, accessToken, range);
    for (const row of perf) await upsertUrlSnapshot(row.id, rangeKey, range, row);
  }
}

export async function processRefreshBatch(accessToken: string, limit = 25) {
  const jobs = await query<any>("select id, range_key, start_date, end_date from refresh_jobs where status in ('pending','running') order by created_at limit 1");
  const job = jobs.rows[0];
  if (!job) return { processed: 0 };
  await query("update refresh_jobs set status='running', updated_at=now() where id=$1", [job.id]);
  const items = await query<any>(`select i.id item_id, c.id, c.project, c.url, c.member_name, c.member_email, c.gsc_property
    from refresh_job_items i join content_urls c on c.id=i.content_url_id
    where i.refresh_job_id=$1 and i.status='pending' order by i.created_at limit $2`, [job.id, limit]);
  const range = { startDate: String(job.start_date).slice(0,10), endDate: String(job.end_date).slice(0,10), label: String(job.range_key) };
  const rows = items.rows.map((r:any) => ({ id: String(r.id), project: r.project, url: r.url, member_name: r.member_name, memberEmail: String(r.member_email ?? "").toLowerCase(), gscProperty: r.gsc_property }));
  await processRange(rows, accessToken, job.range_key, range);
  await processRange(rows, accessToken, `previous:${job.range_key}`, getPreviousRange(range));
  for (const item of items.rows) await query("update refresh_job_items set status='complete', updated_at=now() where id=$1", [item.item_id]);
  const remaining = await query<any>("select count(*)::int count from refresh_job_items where refresh_job_id=$1 and status='pending'", [job.id]);
  if (remaining.rows[0].count === 0) {
    const compared = await getDbPerformance(job.range_key, range);
    await upsertMemberSnapshots(compared, job.range_key, range);
    await query("update refresh_jobs set status='complete', finished_at=now(), updated_at=now() where id=$1", [job.id]);
  }
  return { jobId: job.id, processed: rows.length, remaining: remaining.rows[0].count };
}

export async function refreshStatus(jobId?: string) {
  const jobs = await query<any>(`select j.*, count(i.id)::int total_items, count(i.id) filter (where i.status='complete')::int complete_items, count(i.id) filter (where i.status='failed')::int failed_items
    from refresh_jobs j left join refresh_job_items i on i.refresh_job_id=j.id
    ${jobId ? "where j.id=$1" : ""} group by j.id order by j.created_at desc limit 10`, jobId ? [jobId] : []);
  return jobs.rows;
}
