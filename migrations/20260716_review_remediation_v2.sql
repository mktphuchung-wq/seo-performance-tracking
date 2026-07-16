-- Codex review remediation v2.
-- Additive and idempotent. Apply only to an isolated Neon Preview branch first.
begin;

-- Keep the age-banded observed-zero contract consistent across SQL and runtime.
update public.project_performance_rule_versions
set observed_zero_policy = case
  when jsonb_typeof(observed_zero_policy) = 'object' then
    jsonb_build_object(
      'under_14_days', coalesce((observed_zero_policy->>'under_14_days')::numeric, 70),
      'days_14_to_27', coalesce((observed_zero_policy->>'days_14_to_27')::numeric, 55),
      'days_28_plus', coalesce((observed_zero_policy->>'days_28_plus')::numeric, 40)
    )
  else '{"under_14_days":70,"days_14_to_27":55,"days_28_plus":40}'::jsonb
end
where observed_zero_policy is null
   or jsonb_typeof(observed_zero_policy) <> 'object'
   or not (observed_zero_policy ?& array['under_14_days','days_14_to_27','days_28_plus']);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_performance_rules_observed_zero_policy_check'
  ) then
    alter table public.project_performance_rule_versions
      add constraint project_performance_rules_observed_zero_policy_check
      check (
        jsonb_typeof(observed_zero_policy) = 'object'
        and observed_zero_policy ?& array['under_14_days','days_14_to_27','days_28_plus']
        and (observed_zero_policy->>'under_14_days')::numeric between 0 and 100
        and (observed_zero_policy->>'days_14_to_27')::numeric between 0 and 100
        and (observed_zero_policy->>'days_28_plus')::numeric between 0 and 100
      ) not valid;
    alter table public.project_performance_rule_versions
      validate constraint project_performance_rules_observed_zero_policy_check;
  end if;
end $$;

-- Preserve legacy business events while attaching canonical project/member identities.
insert into public.projects(canonical_name, created_at, updated_at)
select distinct source.project, now(), now()
from (
  select nullif(trim(project), '') as project from public.content_urls
  union
  select nullif(trim(project), '') as project from public.url_work_events
) source
where source.project is not null
on conflict(canonical_name) do update set updated_at = now();

insert into public.members(canonical_name, created_at, updated_at)
select distinct nullif(trim(member_name), ''), now(), now()
from public.url_work_events
where nullif(trim(member_name), '') is not null
on conflict(canonical_name) do update set updated_at = now();

update public.content_urls c
set project_id = p.id,
    normalized_domain = coalesce(
      nullif(c.normalized_domain, ''),
      lower(regexp_replace(split_part(split_part(c.url, '://', 2), '/', 1), '^www\\.', ''))
    ),
    classification_status = case
      when c.url ~* '^https?://[^[:space:]]+$' and nullif(trim(c.project), '') is not null
        then 'accepted'
      else 'quarantined'
    end,
    classification_issues = case
      when c.url !~* '^https?://[^[:space:]]+$' then '["url_invalid"]'::jsonb
      when nullif(trim(c.project), '') is null then '["project_unresolved"]'::jsonb
      else '[]'::jsonb
    end,
    classification_version = 'review_remediation_v2',
    classified_at = now(),
    updated_at = now()
from public.projects p
where p.canonical_name = c.project
  and (
    c.project_id is distinct from p.id
    or c.classification_status is distinct from case
      when c.url ~* '^https?://[^[:space:]]+$' and nullif(trim(c.project), '') is not null
        then 'accepted'
      else 'quarantined'
    end
  );

-- A legacy import can contain the same business event from two historical sources.
-- Keep every row for audit, but only the deterministic winner stays active/payable.
with ranked as (
  select e.id,
         row_number() over (
           partition by e.project, e.content_url_id, e.member_name, e.work_date, e.work_type
           order by case e.source
             when 'content_urls_sheet' then 1
             when 'google_sheet' then 2
             when 'content_urls_backfill' then 3
             else 4 end,
             e.updated_at desc,
             e.id desc
         ) as winner_rank
  from public.url_work_events e
  where nullif(trim(e.project), '') is not null
    and nullif(trim(e.member_name), '') is not null
    and e.work_date is not null
    and nullif(trim(e.work_type), '') is not null
)
update public.url_work_events e
set unified_source_state = 'inactive_for_unified_kpi',
    source_missing_at = coalesce(e.source_missing_at, now()),
    is_countable = false,
    kpi_ready = false,
    content_kpi_eligible = false,
    performance_kpi_eligible = false,
    performance_readiness_state = 'blocked_system_error',
    performance_readiness_issues = case
      when coalesce(e.performance_readiness_issues, '[]'::jsonb) ? 'duplicate_legacy_variant'
        then coalesce(e.performance_readiness_issues, '[]'::jsonb)
      else coalesce(e.performance_readiness_issues, '[]'::jsonb) || '["duplicate_legacy_variant"]'::jsonb
    end,
    updated_at = now()
from ranked r
where r.id = e.id and r.winner_rank > 1
  and coalesce(e.unified_source_state, 'active') = 'active';

update public.url_work_events e
set project_id = p.id,
    member_id = m.id,
    is_countable = (
      coalesce(e.unified_source_state, 'active') = 'active'
      and e.status in ('completed','approved')
      and e.work_date is not null
      and nullif(trim(e.work_type), '') is not null
      and c.url ~* '^https?://[^[:space:]]+$'
      and c.classification_status in ('accepted','pending')
    ),
    kpi_ready = (
      coalesce(e.unified_source_state, 'active') = 'active'
      and e.status in ('completed','approved')
      and e.work_date is not null
      and nullif(trim(e.work_type), '') is not null
      and c.url ~* '^https?://[^[:space:]]+$'
      and c.classification_status in ('accepted','pending')
    ),
    content_kpi_eligible = (
      coalesce(e.unified_source_state, 'active') = 'active'
      and e.status in ('completed','approved')
      and e.work_date is not null
      and nullif(trim(e.work_type), '') is not null
      and c.url ~* '^https?://[^[:space:]]+$'
      and c.classification_status in ('accepted','pending')
    ),
    performance_kpi_eligible = (
      coalesce(e.unified_source_state, 'active') = 'active'
      and e.status in ('completed','approved')
      and e.work_date is not null
      and nullif(trim(e.work_type), '') is not null
      and c.url ~* '^https?://[^[:space:]]+$'
      and c.classification_status in ('accepted','pending')
    )
      and p.gsc_access_status = 'verified' and coalesce(p.gsc_ready, false),
    performance_readiness_state = case
      when coalesce(e.unified_source_state, 'active') <> 'active'
        or e.status not in ('completed','approved')
        or e.work_date is null
        or nullif(trim(e.work_type), '') is null
        or c.url !~* '^https?://[^[:space:]]+$'
        or c.classification_status not in ('accepted','pending') then 'blocked_system_error'
      when p.gsc_access_status = 'verified' and coalesce(p.gsc_ready, false) then 'fallback'
      when p.lifecycle = 'new_project' then 'provisional'
      else 'pm_review'
    end,
    performance_readiness_issues = case
      when coalesce(e.unified_source_state, 'active') <> 'active' then '["source_inactive"]'::jsonb
      when e.status not in ('completed','approved') then '["source_status_not_payable"]'::jsonb
      when e.work_date is null then '["completion_date_missing"]'::jsonb
      when nullif(trim(e.work_type), '') is null then '["work_type_unresolved"]'::jsonb
      when c.url !~* '^https?://[^[:space:]]+$' then '["url_invalid"]'::jsonb
      when c.classification_status not in ('accepted','pending') then '["classification_blocked"]'::jsonb
      when p.gsc_access_status = 'verified' and coalesce(p.gsc_ready, false) then '[]'::jsonb
      when p.lifecycle = 'new_project' then '["gsc_history_provisional"]'::jsonb
      else '["gsc_property_unverified"]'::jsonb
    end,
    readiness_issues = coalesce(e.readiness_issues, '[]'::jsonb)
      - 'project_not_kpi_ready'
      - 'project_settings_missing'
      - 'gsc_property_unverified',
    exclusion_reason = case
      when coalesce(e.unified_source_state, 'active') <> 'active' then 'source_inactive'
      when e.status not in ('completed','approved') then 'source_status_not_payable'
      when e.work_date is null then 'completion_date_missing'
      when nullif(trim(e.work_type), '') is null then 'work_type_unresolved'
      when c.url !~* '^https?://[^[:space:]]+$' then 'url_invalid'
      when c.classification_status not in ('accepted','pending') then 'classification_blocked'
      else null
    end,
    updated_at = now()
from public.projects p,
     public.members m,
     public.content_urls c
where p.canonical_name = e.project
  and m.canonical_name = e.member_name
  and c.id = e.content_url_id;

create index if not exists url_work_events_member_month_content_v2_idx
  on public.url_work_events(member_id, work_date, project_id)
  where content_kpi_eligible = true
    and is_countable = true
    and unified_source_state = 'active';

commit;
