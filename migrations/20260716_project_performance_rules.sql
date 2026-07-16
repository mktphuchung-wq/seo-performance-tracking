-- Unified SEO KPI final Preview contract.
-- Additive and idempotent. Apply only to an isolated Neon Preview branch.
begin;

create table if not exists public.project_gsc_verifications (
  id bigserial primary key,
  project_id uuid not null references public.projects(id),
  gsc_property text not null,
  permission_level text,
  access_status text not null,
  domain_scope_status text not null,
  test_query_status text not null,
  include_subdomains boolean not null default false,
  verified_by text,
  verified_at timestamptz,
  expires_at timestamptz,
  error_code text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_gsc_verifications_project_idx
  on public.project_gsc_verifications(project_id,verified_at desc,id desc);

alter table public.projects
  add column if not exists gsc_access_status text not null default 'unverified',
  add column if not exists gsc_permission_level text,
  add column if not exists gsc_verified_at timestamptz,
  add column if not exists gsc_verified_by text,
  add column if not exists gsc_verification_id bigint,
  add column if not exists include_subdomains boolean not null default false;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='projects_gsc_verification_id_fkey'
  ) then
    alter table public.projects add constraint projects_gsc_verification_id_fkey
      foreign key(gsc_verification_id) references public.project_gsc_verifications(id);
  end if;
end $$;

alter table public.project_settings_versions
  add column if not exists gsc_verification_id bigint references public.project_gsc_verifications(id),
  add column if not exists include_subdomains boolean not null default false;

alter table public.content_urls
  add column if not exists registrable_domain text,
  add column if not exists gsc_eligibility_reason text,
  add column if not exists classified_at timestamptz,
  add column if not exists classification_run_id bigint references public.work_sync_runs(id);

alter table public.url_work_events
  add column if not exists content_kpi_eligible boolean not null default false,
  add column if not exists performance_kpi_eligible boolean not null default false,
  add column if not exists performance_readiness_state text not null default 'blocked_system_error',
  add column if not exists performance_readiness_issues jsonb not null default '[]'::jsonb;
alter table public.url_work_events drop constraint if exists url_work_events_performance_readiness_state_check;
alter table public.url_work_events add constraint url_work_events_performance_readiness_state_check
  check(performance_readiness_state in ('full','fallback','provisional','pm_review','blocked_system_error'));
create index if not exists url_work_events_content_eligible_idx
  on public.url_work_events(member_id,work_date) where content_kpi_eligible=true;
create index if not exists url_work_events_performance_eligible_idx
  on public.url_work_events(project_id,member_id,work_date) where performance_kpi_eligible=true;

create table if not exists public.project_performance_rule_versions (
  id bigserial primary key,
  project_id uuid not null references public.projects(id),
  version text not null,
  lifecycle text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft',
  fallback_window_days integer[] not null default array[28,14,7],
  minimum_short_window_days integer not null default 7,
  neutral_score_pct numeric(5,2) not null default 70,
  confidence_high_factor numeric(5,4) not null default 1,
  confidence_medium_factor numeric(5,4) not null default 0.7,
  confidence_low_factor numeric(5,4) not null default 0.35,
  unknown_score_pct numeric(5,2) not null default 70,
  observed_zero_policy jsonb not null default '{"under_14_days":70,"days_14_to_27":55,"days_28_plus":40}'::jsonb,
  max_provisional_payable_pct numeric(5,2) not null default 70,
  pm_review_threshold_pct numeric(5,2) not null default 55,
  min_eligible_events integer not null default 1,
  min_known_coverage_pct numeric(5,2) not null default 60,
  min_post_impressions integer not null default 0,
  range_fallback_policy jsonb not null default '{"renormalize_missing":true,"deduplicate_effective_horizon":true}'::jsonb,
  settings_payload jsonb not null default '{}'::jsonb,
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_performance_rule_versions_key unique(project_id,version),
  constraint project_performance_rule_versions_lifecycle_check check(lifecycle in ('new_project','growth_project','stable_project')),
  constraint project_performance_rule_versions_status_check check(status in ('draft','approved','superseded')),
  constraint project_performance_rule_versions_thresholds_check check(
    minimum_short_window_days>0 and neutral_score_pct between 0 and 100
    and confidence_high_factor between 0 and 1 and confidence_medium_factor between 0 and 1
    and confidence_low_factor between 0 and 1 and unknown_score_pct between 0 and 100
    and max_provisional_payable_pct between 0 and 100 and pm_review_threshold_pct between 0 and 100
    and min_eligible_events>0 and min_known_coverage_pct between 0 and 100 and min_post_impressions>=0
  )
);
create index if not exists project_performance_rule_versions_effective_idx
  on public.project_performance_rule_versions(project_id,effective_from desc,id desc) where status='approved';

alter table public.performance_event_evaluations
  add column if not exists effective_window_days integer,
  add column if not exists fallback_level text,
  add column if not exists readiness_reason text;
alter table public.performance_range_results
  add column if not exists effective_horizon text;

-- Backward-compatible alias: Content eligibility is independent of long-term GSC readiness.
update public.url_work_events e
set content_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active'
      and coalesce(c.classification_status,'pending')='accepted'),
    kpi_ready=(e.is_countable and coalesce(e.unified_source_state,'active')='active'
      and coalesce(c.classification_status,'pending')='accepted'),
    performance_kpi_eligible=(e.is_countable and coalesce(e.unified_source_state,'active')='active'
      and coalesce(c.classification_status,'pending')='accepted' and coalesce(c.gsc_ready,false)),
    performance_readiness_state=case
      when not e.is_countable or coalesce(e.unified_source_state,'active')<>'active' then 'blocked_system_error'
      when coalesce(c.classification_status,'pending')<>'accepted' then 'blocked_system_error'
      when coalesce(c.gsc_ready,false) then 'fallback'
      else 'pm_review' end,
    performance_readiness_issues=case
      when not e.is_countable then jsonb_build_array(coalesce(e.exclusion_reason,'event_not_countable'))
      when coalesce(e.unified_source_state,'active')<>'active' then '["source_missing"]'::jsonb
      when coalesce(c.classification_status,'pending')<>'accepted' then '["classification_pending"]'::jsonb
      when not coalesce(c.gsc_ready,false) then '["gsc_property_unverified"]'::jsonb
      else '[]'::jsonb end,
    readiness_issues=(coalesce(e.readiness_issues,'[]'::jsonb)-'project_not_kpi_ready'),
    updated_at=now()
from public.content_urls c
where c.id=e.content_url_id;

commit;
