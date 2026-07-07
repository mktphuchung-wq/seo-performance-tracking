begin;

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
  constraint project_kpi_settings_type_check check (project_kpi_type in ('new_project', 'growth_project', 'stable_project')),
  constraint project_kpi_settings_pct_check check (
    (performance_floor_pct is null or (performance_floor_pct >= 0 and performance_floor_pct <= 100)) and
    (performance_cap_pct is null or (performance_cap_pct >= 0 and performance_cap_pct <= 100)) and
    (pm_override_adjusted_pct is null or (pm_override_adjusted_pct >= 0 and pm_override_adjusted_pct <= 100))
  )
);

create or replace function public.set_project_kpi_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_project_kpi_settings_updated_at on public.project_kpi_settings;
create trigger trg_project_kpi_settings_updated_at
before update on public.project_kpi_settings
for each row execute function public.set_project_kpi_settings_updated_at();

commit;
