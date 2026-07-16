import { query } from "../db";

const monthKey = (value: string) =>
  /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 10);

export type MemberOption = {
  memberId: string | null;
  memberName: string;
  email: string | null;
  isActive: boolean;
  eventCount: number;
  sources: string[];
};

export async function listMemberOptions(
  monthInput: string,
  scope: "performance" | "review" | "close" = "review",
): Promise<MemberOption[]> {
  void scope;
  const month = monthKey(monthInput);
  const result = await query<any>(
    `with candidates as (
      select m.id,m.canonical_name as member_name,m.email,m.is_active,1 priority,'active_member' source
      from public.members m where m.is_active=true
      union all
      select e.member_id,e.member_name,m.email,coalesce(m.is_active,false),2,'month_event'
      from public.url_work_events e left join public.members m on m.id=e.member_id
      where e.work_date>=date_trunc('month',$1::date)
        and e.work_date<date_trunc('month',$1::date)+interval '1 month'
        and e.is_countable=true and coalesce(e.unified_source_state,'active')='active'
      union all
      select t.member_id,t.member_name,m.email,coalesce(m.is_active,false),3,'target'
      from public.monthly_member_targets t left join public.members m on m.id=t.member_id where t.month_key=$1
      union all
      select c.member_id,c.member_name,m.email,coalesce(m.is_active,false),3,'config'
      from public.monthly_member_kpi_configs c left join public.members m on m.id=c.member_id where c.month_key=$1
    ), grouped as (
      select id,member_name,max(email) email,bool_or(is_active) is_active,min(priority) priority,
        array_agg(distinct source order by source) sources
      from candidates where nullif(member_name,'') is not null group by id,member_name
    )
    select g.id::text,g.member_name,g.email,g.is_active,g.sources,
      (select count(*)::int from public.url_work_events e
       where (e.member_id=g.id or (g.id is null and e.member_name=g.member_name))
         and e.work_date>=date_trunc('month',$1::date)
         and e.work_date<date_trunc('month',$1::date)+interval '1 month'
         and e.is_countable=true and coalesce(e.unified_source_state,'active')='active') event_count
    from grouped g order by g.priority,g.member_name`,
    [month],
  );
  return result.rows.map((row) => ({
    memberId: row.id ?? null,
    memberName: row.member_name,
    email: row.email ?? null,
    isActive: Boolean(row.is_active),
    eventCount: Number(row.event_count ?? 0),
    sources: Array.isArray(row.sources) ? row.sources : [],
  })) as MemberOption[];
}
