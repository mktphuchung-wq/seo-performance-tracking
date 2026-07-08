-- Add cohort-based URL measurement fields.

begin;

alter table public.content_urls
  add column if not exists content_worked_at date;

update public.content_urls
set content_worked_at = coalesce(content_worked_at, updated_at::date, created_at::date)
where content_worked_at is null;

create index if not exists content_urls_content_worked_at_idx
on public.content_urls (content_worked_at)
where coalesce(is_active, true) = true;

alter table public.project_kpi_settings
  add column if not exists enable_cohort_based_measurement boolean not null default true,
  add column if not exists url_work_date_field text not null default 'content_worked_at',
  add column if not exists seo_lag_days integer not null default 30,
  add column if not exists cohort_mode_1m text not null default 'previous_month_work',
  add column if not exists cohort_mode_3m text not null default 'previous_3_month_work',
  add column if not exists cohort_mode_6m text not null default 'previous_6_month_work',
  add column if not exists cohort_mode_all_time text not null default 'all_active_urls';

alter table public.project_kpi_settings
  drop constraint if exists project_kpi_settings_cohort_mode_1m_check,
  add constraint project_kpi_settings_cohort_mode_1m_check check (cohort_mode_1m in ('previous_month_work','previous_3_month_work','previous_6_month_work','lagged_before_window','all_active_urls')),
  drop constraint if exists project_kpi_settings_cohort_mode_3m_check,
  add constraint project_kpi_settings_cohort_mode_3m_check check (cohort_mode_3m in ('previous_month_work','previous_3_month_work','previous_6_month_work','lagged_before_window','all_active_urls')),
  drop constraint if exists project_kpi_settings_cohort_mode_6m_check,
  add constraint project_kpi_settings_cohort_mode_6m_check check (cohort_mode_6m in ('previous_month_work','previous_3_month_work','previous_6_month_work','lagged_before_window','all_active_urls')),
  drop constraint if exists project_kpi_settings_cohort_mode_all_time_check,
  add constraint project_kpi_settings_cohort_mode_all_time_check check (cohort_mode_all_time in ('previous_month_work','previous_3_month_work','previous_6_month_work','lagged_before_window','all_active_urls')),
  drop constraint if exists project_kpi_settings_seo_lag_days_check,
  add constraint project_kpi_settings_seo_lag_days_check check (seo_lag_days >= 0);

commit;
