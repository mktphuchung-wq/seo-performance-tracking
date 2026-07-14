-- Monthly SEO KPI Engine v2. Additive, idempotent, and staging-first.
-- Apply after 20260710_url_work_events.sql and 20260710_monthly_kpi.sql.
begin;

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), canonical_name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.project_aliases (
  id bigserial primary key, project_id uuid not null references public.projects(id), alias text not null, alias_key text not null unique,
  is_active boolean not null default true, created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(), canonical_name text not null unique, email text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists members_email_key on public.members(lower(email)) where email is not null;
create table if not exists public.member_aliases (
  id bigserial primary key, member_id uuid not null references public.members(id), alias text not null, alias_key text not null unique,
  is_active boolean not null default true, created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.work_sync_runs (
  id bigserial primary key, source text not null, status text not null, raw_row_count integer not null default 0,
  logical_item_count integer not null default 0, canonical_event_count integer not null default 0,
  quarantined_count integer not null default 0, duplicate_variant_count integer not null default 0,
  diagnostics jsonb not null default '{}'::jsonb, triggered_by text, error_message text,
  started_at timestamptz not null default now(), finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint work_sync_runs_status_check check (status in ('running','completed','failed','dry_run'))
);
create table if not exists public.work_source_rows (
  id bigserial primary key, sync_run_id bigint not null references public.work_sync_runs(id), source text not null,
  source_row_number integer not null, source_item_id text, raw_payload jsonb not null, normalized_payload jsonb not null,
  logical_key text not null, is_canonical_variant boolean not null default false, is_quarantined boolean not null default false,
  quarantine_reasons text[] not null default '{}', ingested_at timestamptz not null default now(),
  constraint work_source_rows_run_row_key unique(sync_run_id,source_row_number)
);
create index if not exists work_source_rows_item_idx on public.work_source_rows(source,source_item_id) where source_item_id is not null;
create index if not exists work_source_rows_logical_idx on public.work_source_rows(logical_key);
create index if not exists work_source_rows_quarantine_idx on public.work_source_rows(sync_run_id,is_quarantined);

create table if not exists public.content_url_aliases (
  id bigserial primary key, content_url_id uuid not null references public.content_urls(id), alias_url text not null unique,
  alias_type text not null default 'redirect', is_active boolean not null default true, created_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint content_url_aliases_type_check check (alias_type in ('redirect','draft','gsc_canonical','legacy','manual'))
);

alter table public.url_work_events
  add column if not exists project_id uuid references public.projects(id),
  add column if not exists member_id uuid references public.members(id),
  add column if not exists source_item_id text,
  add column if not exists source_status text,
  add column if not exists source_url text,
  add column if not exists canonical_url_snapshot text,
  add column if not exists completed_at date,
  add column if not exists date_confidence text not null default 'unknown',
  add column if not exists difficulty_source text,
  add column if not exists unit_rule_id bigint,
  add column if not exists unit_rule_version text,
  add column if not exists is_countable boolean not null default false,
  add column if not exists exclusion_reason text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;
alter table public.url_work_events drop constraint if exists url_work_events_status_check;
alter table public.url_work_events add constraint url_work_events_status_check
  check (status in ('planned','in_progress','reviewed','completed','approved','on_hold','excluded'));
alter table public.url_work_events drop constraint if exists url_work_events_date_confidence_check;
alter table public.url_work_events add constraint url_work_events_date_confidence_check
  check (date_confidence in ('source_completed_at','fallback_source_date','manual_verified','unknown'));
create unique index if not exists url_work_events_source_item_key on public.url_work_events(source,source_item_id) where source_item_id is not null;
create index if not exists url_work_events_countable_month_idx on public.url_work_events(project,member_name,work_date) where is_countable=true;

alter table public.monthly_member_kpi_targets
  add column if not exists target_version text not null default 'target_v2',
  add column if not exists base_target_units numeric(10,2),
  add column if not exists active_workday_ratio numeric(6,5),
  add column if not exists target_adjustment_reason text,
  add column if not exists is_locked boolean not null default false,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;
alter table public.monthly_member_kpi_targets drop constraint if exists monthly_member_kpi_targets_active_ratio_check;
alter table public.monthly_member_kpi_targets add constraint monthly_member_kpi_targets_active_ratio_check
  check (active_workday_ratio is null or active_workday_ratio between 0 and 1);
alter table public.monthly_member_kpi_targets drop constraint if exists monthly_member_kpi_targets_proration_reason_check;
alter table public.monthly_member_kpi_targets add constraint monthly_member_kpi_targets_proration_reason_check
  check (active_workday_ratio is null or active_workday_ratio=1 or nullif(trim(target_adjustment_reason),'') is not null);

alter table public.kpi_work_unit_rules
  add column if not exists rule_version text not null default 'legacy_v1',
  add column if not exists valid_from date not null default '2000-01-01',
  add column if not exists valid_to date,
  add column if not exists created_by text;
drop index if exists public.kpi_work_unit_rules_scope_key;
create unique index if not exists kpi_work_unit_rules_version_scope_key on public.kpi_work_unit_rules
  (coalesce(project,''),coalesce(member_name,''),work_type,difficulty,rule_version,valid_from);
update public.kpi_work_unit_rules set is_active=false,updated_at=now(),notes=concat_ws(' ',notes,'Superseded by KPI v2 defaults.')
where project is null and member_name is null and rule_version <> 'unit_v2';
insert into public.kpi_work_unit_rules(project,member_name,work_type,difficulty,unit_value,is_active,notes,rule_version,valid_from)
values
 (null,null,'new_content','normal',1,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'audit','basic',0.5,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'audit','standard',0.75,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'audit','deep',1,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'update','basic',0.5,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'update','standard',0.75,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'update','deep',1,true,'KPI v2 default','unit_v2','2026-07-01'),
 (null,null,'portfolio','normal',0,true,'KPI v2 default','unit_v2','2026-07-01')
on conflict do nothing;

create table if not exists public.kpi_quality_rubrics (
  id bigserial primary key, rubric_key text not null unique, name text not null, project text,
  work_type text not null, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint kpi_quality_rubrics_type_check check (work_type in ('new_content','audit','update'))
);
create table if not exists public.kpi_quality_rubric_versions (
  id bigserial primary key, rubric_id bigint not null references public.kpi_quality_rubrics(id), version text not null,
  status text not null default 'draft', total_weight_pct numeric(5,2) not null default 100,
  effective_from date, approved_by text, approved_at timestamptz, created_at timestamptz not null default now(),
  constraint kpi_quality_rubric_versions_key unique(rubric_id,version),
  constraint kpi_quality_rubric_versions_status_check check(status in ('draft','approved','retired')),
  constraint kpi_quality_rubric_versions_weight_check check(total_weight_pct=100)
);
alter table public.kpi_quality_criteria
  add column if not exists rubric_version_id bigint references public.kpi_quality_rubric_versions(id),
  add column if not exists work_type text,
  add column if not exists difficulty text,
  add column if not exists allows_na boolean not null default false,
  add column if not exists score_anchor_json jsonb not null default '{}'::jsonb;
drop index if exists public.kpi_quality_criteria_scope_key;
create unique index if not exists kpi_quality_criteria_rubric_key on public.kpi_quality_criteria
  (coalesce(rubric_version_id,0),criterion_key);
alter table public.url_work_quality_reviews
  add column if not exists rubric_version_id bigint references public.kpi_quality_rubric_versions(id),
  add column if not exists rubric_version_snapshot text,
  add column if not exists criteria_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists override_reason text;
alter table public.url_work_quality_scores alter column score drop not null;
alter table public.url_work_quality_scores drop constraint if exists url_work_quality_scores_score_check;
alter table public.url_work_quality_scores add constraint url_work_quality_scores_score_check check(score is null or score between 0 and 5);
alter table public.url_work_quality_scores
  add column if not exists is_na boolean not null default false,
  add column if not exists na_reason text,
  add column if not exists evidence text,
  add column if not exists criterion_key_snapshot text,
  add column if not exists criterion_name_snapshot text,
  add column if not exists weight_pct_snapshot numeric(5,2);
alter table public.url_work_quality_scores drop constraint if exists url_work_quality_scores_na_check;
alter table public.url_work_quality_scores add constraint url_work_quality_scores_na_check check(
  (is_na=false and score is not null) or (is_na=true and score is null and nullif(trim(na_reason),'') is not null)
);
create table if not exists public.quality_review_calibrations (
  id bigserial primary key, work_event_id bigint not null references public.url_work_events(id),
  primary_review_id bigint not null references public.url_work_quality_reviews(id), calibrator text not null,
  primary_quality_pct numeric(5,2) not null, calibration_quality_pct numeric(5,2) not null,
  difference_pct numeric(5,2) not null, status text not null, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint quality_review_calibrations_key unique(primary_review_id,calibrator),
  constraint quality_review_calibrations_status_check check(status in ('within_tolerance','calibration_required','resolved'))
);

insert into public.kpi_quality_rubrics(rubric_key,name,work_type)
values ('new_content','New Content KPI v2','new_content'),('audit','Audit KPI v2','audit'),('update','Update KPI v2','update')
on conflict do nothing;
insert into public.kpi_quality_rubric_versions(rubric_id,version,status,total_weight_pct,effective_from,approved_by,approved_at)
select id,case rubric_key when 'new_content' then 'quality_new_content_v2' else 'quality_audit_update_v2' end,
  'approved',100,'2026-07-01','migration',now() from public.kpi_quality_rubrics where rubric_key in ('new_content','audit','update')
on conflict do nothing;
with criteria(work_type,criterion_key,criterion_name,weight_pct,display_order,allows_na) as (values
 ('new_content','intent_audience_pain','Search intent, audience/persona, pain point',20,10,false),
 ('new_content','outline_structure','Outline, hierarchy, structure',10,20,false),
 ('new_content','usefulness_semantics','Usefulness, completeness, semantic coverage',25,30,false),
 ('new_content','accuracy_eeat','Accuracy, E-E-A-T, trustworthy sourcing',15,40,false),
 ('new_content','metadata_onpage','Metadata, on-page/entity optimization',10,50,false),
 ('new_content','links','Internal/external links',10,60,true),
 ('new_content','ux_media_accessibility','UX, readability, media, accessibility',10,70,true),
 ('audit','diagnosis','Diagnosis, evidence, prioritization',15,10,false),
 ('audit','intent_semantic_gap','Intent and semantic-gap correction',15,20,false),
 ('audit','accuracy_freshness_eeat','Accuracy, freshness, E-E-A-T',15,30,false),
 ('audit','structure_ux','Structure, UX, readability',10,40,false),
 ('audit','metadata_onpage','Metadata/on-page optimization',10,50,true),
 ('audit','links','Internal/external links',10,60,true),
 ('audit','media_accessibility','Media/accessibility',10,70,true),
 ('audit','implementation_qa','Implementation completeness and QA',15,80,false),
 ('update','diagnosis','Diagnosis, evidence, prioritization',15,10,false),
 ('update','intent_semantic_gap','Intent and semantic-gap correction',15,20,false),
 ('update','accuracy_freshness_eeat','Accuracy, freshness, E-E-A-T',15,30,false),
 ('update','structure_ux','Structure, UX, readability',10,40,false),
 ('update','metadata_onpage','Metadata/on-page optimization',10,50,true),
 ('update','links','Internal/external links',10,60,true),
 ('update','media_accessibility','Media/accessibility',10,70,true),
 ('update','implementation_qa','Implementation completeness and QA',15,80,false)
)
insert into public.kpi_quality_criteria(project,criterion_key,criterion_name,review_level,weight_pct,display_order,is_active,
  description,rubric_version_id,work_type,allows_na,score_anchor_json)
select null,c.criterion_key,c.criterion_name,'url',c.weight_pct,c.display_order,true,c.criterion_name,v.id,c.work_type,c.allows_na,
  '{"0":"Missing","1":"Poor","2":"Weak","3":"Acceptable","4":"Meets","5":"Excellent"}'::jsonb
from criteria c join public.kpi_quality_rubrics r on r.work_type=c.work_type
join public.kpi_quality_rubric_versions v on v.rubric_id=r.id and v.status='approved'
on conflict do nothing;

create table if not exists public.gsc_fetch_runs (
  id bigserial primary key, run_key text not null unique, status text not null, data_cutoff date not null,
  latest_complete_date date, properties_total integer not null default 0, properties_succeeded integer not null default 0,
  properties_failed integer not null default 0, diagnostics jsonb not null default '{}'::jsonb, error_message text,
  started_at timestamptz not null default now(), finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gsc_fetch_runs_status_check check(status in ('running','completed','partial','failed'))
);
create table if not exists public.gsc_url_daily_metrics (
  id bigserial primary key, fetch_run_id bigint references public.gsc_fetch_runs(id), gsc_property text not null,
  canonical_url text not null, metric_date date not null, search_type text not null default 'web', data_status text not null,
  clicks numeric, impressions numeric, ctr numeric, position numeric, error_code text, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint gsc_url_daily_metrics_key unique(gsc_property,canonical_url,metric_date,search_type),
  constraint gsc_url_daily_metrics_status_check check(data_status in ('observed','observed_zero','unknown')),
  constraint gsc_url_daily_metrics_unknown_check check(data_status='unknown' or (clicks is not null and impressions is not null))
);
create index if not exists gsc_url_daily_metrics_url_date_idx on public.gsc_url_daily_metrics(canonical_url,metric_date);
create table if not exists public.performance_evaluation_cohorts (
  id bigserial primary key, month_key date not null, project text not null, member_name text not null,
  strategy text not null, cohort_key text not null, event_ids bigint[] not null default '{}', control_url_ids uuid[] not null default '{}',
  rule_version text not null, lineage jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint performance_evaluation_cohorts_key unique(month_key,project,member_name,cohort_key,rule_version),
  constraint performance_evaluation_cohorts_strategy_check check(strategy in ('new_project','growth_project','stable_audit'))
);
create table if not exists public.performance_event_evaluations (
  id bigserial primary key, cohort_id bigint not null references public.performance_evaluation_cohorts(id), work_event_id bigint not null references public.url_work_events(id),
  evaluation_key text not null, evaluation_horizon text not null default '28d', pre_start_date date, pre_end_date date,
  post_start_date date, post_end_date date, data_status text not null, comparison_coverage_pct numeric,
  raw_metrics jsonb not null default '{}'::jsonb, sub_scores jsonb not null default '{}'::jsonb,
  raw_pct numeric, payable_pct numeric, confidence text not null default 'unknown', status text not null,
  contamination_reason text, control_fallback_reason text, rule_version text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint performance_event_evaluations_key unique(work_event_id,evaluation_key,rule_version),
  constraint performance_event_evaluations_data_status_check check(data_status in ('observed','observed_zero','unknown')),
  constraint performance_event_evaluations_score_check check((raw_pct is null or raw_pct between 0 and 100) and (payable_pct is null or payable_pct between 0 and 100))
);
create table if not exists public.performance_project_member_month_results (
  id bigserial primary key, month_key date not null, project text not null, member_name text not null,
  cohort_id bigint references public.performance_evaluation_cohorts(id), strategy text not null, raw_pct numeric, payable_pct numeric,
  coverage_pct numeric, comparison_coverage_pct numeric, confidence text not null, source_cohort text,
  rule_version text not null, override_reason text, status text not null, data_as_of date,
  sub_scores jsonb not null default '{}'::jsonb, diagnostics jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint performance_project_member_month_results_key unique(month_key,project,member_name,rule_version),
  constraint performance_project_member_month_results_score_check check((raw_pct is null or raw_pct between 0 and 100) and (payable_pct is null or payable_pct between 0 and 100))
);

alter table public.project_kpi_settings
  add column if not exists measurement_strategy text not null default 'growth_project',
  add column if not exists performance_enabled_for_payroll boolean not null default false,
  add column if not exists min_project_age_days integer not null default 90,
  add column if not exists pre_window_days integer not null default 28,
  add column if not exists post_window_days integer not null default 28,
  add column if not exists min_eligible_events integer not null default 5,
  add column if not exists min_data_coverage_pct numeric(5,2) not null default 80,
  add column if not exists min_total_impressions integer not null default 500,
  add column if not exists zero_signal_score_pct numeric(5,2) not null default 0,
  add column if not exists new_signal_score_pct numeric(5,2) not null default 60,
  add column if not exists seasonality_mode text not null default 'pm_review',
  add column if not exists control_adjustment_enabled boolean not null default true,
  add column if not exists performance_rule_version text not null default 'performance_v2';
alter table public.project_kpi_settings drop constraint if exists project_kpi_settings_measurement_strategy_check;
alter table public.project_kpi_settings add constraint project_kpi_settings_measurement_strategy_check check(measurement_strategy in ('new_project','growth_project','stable_audit'));
alter table public.project_kpi_settings drop constraint if exists project_kpi_settings_v2_thresholds_check;
alter table public.project_kpi_settings add constraint project_kpi_settings_v2_thresholds_check check(
  min_project_age_days>=0 and pre_window_days>0 and post_window_days>0 and seo_lag_days>=0 and min_eligible_events>0
  and min_data_coverage_pct between 0 and 100 and min_total_impressions>=0 and zero_signal_score_pct between 0 and 100 and new_signal_score_pct between 0 and 100
);

create table if not exists public.monthly_member_project_kpi_results (
  id bigserial primary key, month_key date not null, project text not null, member_name text not null,
  quantity_raw_pct numeric, quantity_payable_pct numeric, quantity_coverage_pct numeric, quality_raw_pct numeric,
  quality_payable_pct numeric, quality_coverage_pct numeric, seo_content_raw_pct numeric, seo_content_payable_pct numeric,
  performance_raw_pct numeric, performance_payable_pct numeric, performance_coverage_pct numeric,
  confidence text not null default 'unknown', source_cohort text, rule_version text not null,
  override_reason text, status text not null, source_ids jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb, calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint monthly_member_project_kpi_results_key unique(month_key,project,member_name,rule_version)
);
create table if not exists public.monthly_kpi_component_definitions (
  id bigserial primary key, component_key text not null, version text not null, name text not null,
  default_weight_pct numeric(5,2) not null, is_controllable boolean not null, is_required boolean not null,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint monthly_kpi_component_definitions_key unique(component_key,version),
  constraint monthly_kpi_component_definitions_weight_check check(default_weight_pct between 0 and 100)
);
create table if not exists public.monthly_member_kpi_component_scores (
  id bigserial primary key, month_key date not null, member_name text not null, component_key text not null,
  raw_pct numeric, payable_pct numeric, coverage_pct numeric, confidence text not null default 'unknown', source_cohort text,
  rule_version text not null, override_reason text, status text not null, reason text, source_ids jsonb not null default '[]'::jsonb,
  audit_trail jsonb not null default '[]'::jsonb, diagnostics jsonb not null default '{}'::jsonb,
  data_as_of date, calculated_at timestamptz not null default now(), approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint monthly_member_kpi_component_scores_key unique(month_key,member_name,component_key,rule_version),
  constraint monthly_member_kpi_component_scores_values_check check((raw_pct is null or raw_pct>=0) and (payable_pct is null or payable_pct between 0 and 100) and (coverage_pct is null or coverage_pct between 0 and 100))
);
create table if not exists public.monthly_member_kpi_results (
  id bigserial primary key, month_key date not null, member_name text not null, version integer not null default 1,
  raw_pct numeric, payable_pct numeric, coverage_pct numeric, confidence text not null default 'unknown', source_cohort text,
  rule_version text not null, override_reason text, status text not null default 'draft', payout_base_vnd bigint not null default 3000000,
  payout_vnd bigint, source_ids jsonb not null default '[]'::jsonb, audit_trail jsonb not null default '[]'::jsonb,
  snapshot_payload jsonb not null default '{}'::jsonb, calculated_at timestamptz not null default now(),
  approved_by text, approved_at timestamptz, locked_by text, locked_at timestamptz, reopened_from_id bigint references public.monthly_member_kpi_results(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint monthly_member_kpi_results_key unique(month_key,member_name,version),
  constraint monthly_member_kpi_results_status_check check(status in ('draft','approved','locked','superseded')),
  constraint monthly_member_kpi_results_values_check check((raw_pct is null or raw_pct>=0) and (payable_pct is null or payable_pct between 0 and 100) and (coverage_pct is null or coverage_pct between 0 and 100))
);
create table if not exists public.kpi_override_audit_log (
  id bigserial primary key, month_key date not null, member_name text, project text, component_key text not null,
  entity_type text not null, entity_id text, before_value jsonb, after_value jsonb, reason text not null,
  actor text not null, action text not null, created_at timestamptz not null default now()
);
create index if not exists kpi_override_audit_log_month_member_idx on public.kpi_override_audit_log(month_key,member_name,created_at);

insert into public.monthly_kpi_component_definitions(component_key,version,name,default_weight_pct,is_controllable,is_required)
values
 ('discipline','components_v2','Discipline / Attitude',10,true,true),
 ('seo_content','components_v2','SEO Content',50,true,true),
 ('seo_performance','components_v2','SEO Performance',20,false,false),
 ('social_video','components_v2','Social Content + Video',20,true,true)
on conflict do nothing;

insert into public.projects(canonical_name) values ('Print Your Wear'),('Stories of Polynesian Pride'),('Tartan Vibes Clothing') on conflict do nothing;
insert into public.project_aliases(project_id,alias,alias_key,created_by)
select id,'PrintYourWear','printyourwear','migration' from public.projects where canonical_name='Print Your Wear' on conflict do nothing;
insert into public.project_aliases(project_id,alias,alias_key,created_by)
select id,'Print Your Wear','print your wear','migration' from public.projects where canonical_name='Print Your Wear' on conflict do nothing;
insert into public.project_aliases(project_id,alias,alias_key,created_by)
select id,'Polynesian Pride Blog','polynesian pride blog','migration' from public.projects where canonical_name='Stories of Polynesian Pride' on conflict do nothing;
insert into public.project_aliases(project_id,alias,alias_key,created_by)
select id,'Stories of Polynesian Pride','stories of polynesian pride','migration' from public.projects where canonical_name='Stories of Polynesian Pride' on conflict do nothing;

create or replace function public.prevent_locked_kpi_mutation() returns trigger language plpgsql as $$
begin
  if old.status='locked' then raise exception 'Locked KPI snapshots are immutable; reopen into a new version.';
  end if;
  return new;
end $$;
drop trigger if exists monthly_member_kpi_results_locked_guard on public.monthly_member_kpi_results;
create trigger monthly_member_kpi_results_locked_guard before update or delete on public.monthly_member_kpi_results
for each row execute function public.prevent_locked_kpi_mutation();

commit;
