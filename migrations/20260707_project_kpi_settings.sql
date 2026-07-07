create table if not exists public.project_kpi_settings (
  id uuid primary key default gen_random_uuid(),
  project text not null unique,
  project_kpi_type text not null default 'growth_project',
  project_start_date date,
  is_kpi_protection_enabled boolean not null default true,

  performance_floor_pct numeric,
  performance_cap_pct numeric,

  min_coverage_required numeric not null default 0.8,
  min_eligible_urls integer not null default 5,
  max_excluded_no_data_rate numeric not null default 0.5,

  allow_auto_floor_when_low_confidence boolean not null default true,
  allow_auto_floor_when_partial_coverage boolean not null default true,
  allow_auto_floor_when_high_no_data boolean not null default true,

  require_pm_review_below_pct numeric not null default 40,

  pm_override_enabled boolean not null default false,
  pm_override_adjusted_pct numeric,
  pm_override_reason text,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_kpi_settings_type_check
    check (project_kpi_type in ('new_project', 'growth_project', 'stable_project')),

  constraint project_kpi_settings_floor_check
    check (performance_floor_pct is null or performance_floor_pct between 0 and 100),

  constraint project_kpi_settings_cap_check
    check (performance_cap_pct is null or performance_cap_pct between 0 and 100),

  constraint project_kpi_settings_override_check
    check (pm_override_adjusted_pct is null or pm_override_adjusted_pct between 0 and 100),

  constraint project_kpi_settings_coverage_check
    check (min_coverage_required between 0 and 1),

  constraint project_kpi_settings_no_data_rate_check
    check (max_excluded_no_data_rate between 0 and 1)
);

create index if not exists idx_project_kpi_settings_type
on public.project_kpi_settings (project_kpi_type);

alter table public.project_kpi_settings
  add column if not exists performance_weight_1m_pct numeric not null default 30,
  add column if not exists performance_weight_3m_pct numeric not null default 40,
  add column if not exists performance_weight_6m_pct numeric not null default 20,
  add column if not exists performance_weight_all_time_pct numeric not null default 10,
  add column if not exists normalize_missing_ranges boolean not null default true,
  add column if not exists enable_long_term_trend_protection boolean not null default true,
  add column if not exists trend_protection_floor_pct numeric not null default 70,
  add column if not exists trend_protection_required_3m_pct numeric not null default 70,
  add column if not exists trend_protection_required_all_time_pct numeric not null default 70,
  add column if not exists not_enough_data_policy text not null default 'neutral_score',
  add column if not exists neutral_no_data_score_pct numeric not null default 70,
  add column if not exists min_url_age_days_for_penalty integer not null default 90,
  add column if not exists max_no_data_penalty_pct numeric not null default 10,
  add column if not exists no_data_rate_pm_review_pct numeric not null default 50;

alter table public.project_kpi_settings
  drop constraint if exists project_kpi_settings_weights_total_check,
  add constraint project_kpi_settings_weights_total_check
    check (performance_weight_1m_pct + performance_weight_3m_pct + performance_weight_6m_pct + performance_weight_all_time_pct = 100),
  drop constraint if exists project_kpi_settings_no_data_policy_check,
  add constraint project_kpi_settings_no_data_policy_check
    check (not_enough_data_policy in ('exclude_from_performance', 'neutral_score', 'mild_penalty', 'pm_review_required'));
