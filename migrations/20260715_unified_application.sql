-- Unified SEO performance application foundation.
-- Additive and idempotent. Apply only after 20260714_monthly_kpi_engine_v2.sql.
-- This migration deliberately seeds no production project weights or final KPI weights.
begin;

alter table public.projects
  add column if not exists canonical_domain text,
  add column if not exists lifecycle text,
  add column if not exists gsc_property text,
  add column if not exists gsc_ready boolean not null default false,
  add column if not exists kpi_ready boolean not null default false;

alter table public.projects drop constraint if exists projects_lifecycle_check;
alter table public.projects add constraint projects_lifecycle_check
  check (lifecycle is null or lifecycle in ('new_project','growth_project','stable_project'));
create unique index if not exists projects_canonical_domain_key
  on public.projects(lower(canonical_domain)) where canonical_domain is not null;

create table if not exists public.project_domain_mappings (
  id bigserial primary key,
  project_id uuid not null references public.projects(id),
  normalized_domain text not null,
  mapping_version text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft',
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_domain_mappings_key unique(normalized_domain,mapping_version),
  constraint project_domain_mappings_status_check check(status in ('draft','approved','retired')),
  constraint project_domain_mappings_dates_check check(effective_to is null or effective_to>=effective_from)
);
create index if not exists project_domain_mappings_active_idx
  on public.project_domain_mappings(normalized_domain,effective_from,effective_to) where status='approved';

create table if not exists public.project_settings_versions (
  id bigserial primary key,
  project_id uuid not null references public.projects(id),
  version text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft',
  lifecycle text not null,
  canonical_domain text not null,
  gsc_property text,
  gsc_ready boolean not null default false,
  kpi_ready boolean not null default false,
  performance_weight_3m_pct numeric(5,2),
  performance_weight_6m_pct numeric(5,2),
  performance_weight_all_time_pct numeric(5,2),
  settings_payload jsonb not null default '{}'::jsonb,
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_settings_versions_key unique(project_id,version),
  constraint project_settings_versions_status_check check(status in ('draft','approved','retired')),
  constraint project_settings_versions_lifecycle_check check(lifecycle in ('new_project','growth_project','stable_project')),
  constraint project_settings_versions_dates_check check(effective_to is null or effective_to>=effective_from),
  constraint project_settings_versions_weights_check check(
    (performance_weight_3m_pct is null and performance_weight_6m_pct is null and performance_weight_all_time_pct is null)
    or (
      performance_weight_3m_pct between 0 and 100 and performance_weight_6m_pct between 0 and 100
      and performance_weight_all_time_pct between 0 and 100
      and performance_weight_3m_pct+performance_weight_6m_pct+performance_weight_all_time_pct=100
    )
  )
);
create index if not exists project_settings_versions_effective_idx
  on public.project_settings_versions(project_id,effective_from,effective_to) where status='approved';

create table if not exists public.member_project_contribution_weights (
  id bigserial primary key,
  month_key date not null,
  member_id uuid not null references public.members(id),
  project_id uuid not null references public.projects(id),
  weight_pct numeric(5,2) not null,
  version text not null,
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_project_contribution_weights_key unique(month_key,member_id,project_id,version),
  constraint member_project_contribution_weights_value_check check(weight_pct between 0 and 100)
);
create index if not exists member_project_contribution_weights_month_idx
  on public.member_project_contribution_weights(month_key,member_id,version);

alter table public.content_urls
  add column if not exists project_id uuid references public.projects(id),
  add column if not exists normalized_domain text,
  add column if not exists classification_status text not null default 'pending',
  add column if not exists classification_issues jsonb not null default '[]'::jsonb,
  add column if not exists classification_version text,
  add column if not exists gsc_ready boolean not null default false;
alter table public.content_urls drop constraint if exists content_urls_classification_status_check;
alter table public.content_urls add constraint content_urls_classification_status_check
  check(classification_status in ('pending','accepted','quarantined'));
create index if not exists content_urls_classified_idx
  on public.content_urls(project_id,classification_status,gsc_ready,is_active);

alter table public.url_work_events
  add column if not exists kpi_ready boolean not null default false,
  add column if not exists readiness_issues jsonb not null default '[]'::jsonb;
create index if not exists url_work_events_kpi_ready_idx
  on public.url_work_events(project_id,member_id,work_date) where kpi_ready=true and is_countable=true;

alter table public.work_sync_runs
  add column if not exists workflow_stage text not null default 'preview',
  add column if not exists accepted_row_count integer not null default 0,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approval_reason text;
alter table public.work_sync_runs drop constraint if exists work_sync_runs_workflow_stage_check;
alter table public.work_sync_runs add constraint work_sync_runs_workflow_stage_check
  check(workflow_stage in ('preview','committed'));

create table if not exists public.performance_range_results (
  id bigserial primary key,
  as_of_month date not null,
  project_id uuid not null references public.projects(id),
  member_id uuid references public.members(id),
  range_key text not null,
  impression_performance_pct numeric,
  click_performance_pct numeric,
  growth_coverage_pct numeric,
  portfolio_health_pct numeric,
  raw_pct numeric,
  payable_pct numeric,
  coverage_pct numeric,
  confidence text not null,
  status text not null,
  source_cohort text,
  source_ids jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  rule_version text not null,
  data_as_of date,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_range_results_key unique(as_of_month,project_id,member_id,range_key,rule_version),
  constraint performance_range_results_range_check check(range_key in ('3m','6m','all_time')),
  constraint performance_range_results_values_check check(
    (payable_pct is null or payable_pct between 0 and 100)
    and (coverage_pct is null or coverage_pct between 0 and 100)
  )
);
create index if not exists performance_range_results_member_idx
  on public.performance_range_results(member_id,as_of_month,range_key);

create table if not exists public.kpi_templates (
  id bigserial primary key,
  template_key text not null,
  version text not null,
  name text not null,
  status text not null default 'draft',
  effective_from date,
  effective_to date,
  reason text not null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_templates_key unique(template_key,version),
  constraint kpi_templates_status_check check(status in ('draft','approved','retired'))
);

create table if not exists public.kpi_template_components (
  id bigserial primary key,
  template_id bigint not null references public.kpi_templates(id),
  component_key text not null,
  weight_pct numeric(5,2) not null,
  is_required boolean not null default true,
  allows_na boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  constraint kpi_template_components_key unique(template_id,component_key),
  constraint kpi_template_components_component_check check(component_key in ('seo_content','seo_performance','social_video')),
  constraint kpi_template_components_weight_check check(weight_pct between 0 and 100)
);

alter table public.monthly_member_kpi_component_scores
  add column if not exists is_not_applicable boolean not null default false,
  add column if not exists na_reason text,
  add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.monthly_member_kpi_component_scores drop constraint if exists monthly_member_kpi_component_scores_na_check;
alter table public.monthly_member_kpi_component_scores add constraint monthly_member_kpi_component_scores_na_check check(
  (is_not_applicable=false)
  or (is_not_applicable=true and payable_pct is null and nullif(trim(na_reason),'') is not null)
);

create table if not exists public.application_audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text not null,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists application_audit_log_entity_idx
  on public.application_audit_log(entity_type,entity_id,created_at);

commit;
